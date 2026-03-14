import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { Effect } from "effect";

import type { Config } from "../../../../../packages/shared/src/index.ts";
import type { AppDatabase } from "../../db/database.ts";
import { DatabaseError } from "../../db/database.ts";
import { downloads, episodes } from "../../db/schema.ts";
import { durationMsSince } from "../../lib/logging.ts";
import { EventBus } from "../events/event-bus.ts";
import {
  currentImportMode,
  loadRuntimeConfig,
  requireAnime,
  toDownloadStatus,
} from "./repository.ts";
import {
  importDownloadedFile,
  shouldDeleteImportedData,
  shouldReconcileCompletedDownloads,
  shouldRemoveTorrentOnImport,
  upsertEpisodeFile,
} from "./download-support.ts";
import { parseEpisodeNumber } from "./library-import.ts";
import {
  inferCoveredEpisodeNumbers,
  parseCoveredEpisodes,
  parseMagnetInfoHash,
  resolveAccessibleDownloadPath,
  resolveBatchContentPaths,
  resolveCompletedContentPath,
  toCoveredEpisodesJson,
} from "./download-lifecycle.ts";
import {
  appendLog,
  loadMissingEpisodeNumbers,
  markDownloadImported,
  nowIso,
  randomHex,
  recordDownloadEvent,
} from "./job-support.ts";
import { parseReleaseName } from "./release-ranking.ts";
import {
  DownloadConflictError,
  DownloadNotFoundError,
  type OperationsError,
} from "./errors.ts";
import type { FileSystemShape } from "../../lib/filesystem.ts";
import type {
  TryDatabasePromise,
  TryOperationsPromise,
} from "./service-support.ts";
import type {
  QBitConfig,
  QBitTorrent,
  QBitTorrentClient,
} from "./qbittorrent.ts";

export function makeDownloadOrchestration(input: {
  db: AppDatabase;
  fs: FileSystemShape;
  qbitClient: typeof QBitTorrentClient.Service;
  eventBus: typeof EventBus.Service;
  tryDatabasePromise: TryDatabasePromise;
  tryOperationsPromise: TryOperationsPromise;
  wrapOperationsError: (
    message: string,
  ) => (cause: unknown) => OperationsError | DatabaseError;
  dbError: (message: string) => (cause: unknown) => DatabaseError;
  maybeQBitConfig: (config: Config) => QBitConfig | null;
  triggerSemaphore: Effect.Semaphore;
}) {
  const {
    db,
    fs,
    qbitClient,
    eventBus,
    tryDatabasePromise,
    tryOperationsPromise,
    wrapOperationsError,
    dbError,
    maybeQBitConfig,
    triggerSemaphore,
  } = input;

  const maybeCleanupImportedTorrent = Effect.fn(
    "OperationsService.maybeCleanupImportedTorrent",
  )(function* (
    config: Config | null | undefined,
    infoHash: string | null,
  ) {
    const qbitConfig = config ? maybeQBitConfig(config) : null;

    if (!qbitConfig || !infoHash || !shouldRemoveTorrentOnImport(config)) {
      return;
    }

    yield* qbitClient.deleteTorrent(
      qbitConfig,
      infoHash,
      shouldDeleteImportedData(config),
    ).pipe(
      Effect.catchAll((cause) =>
        Effect.logWarning("Failed to delete imported torrent from qBittorrent")
          .pipe(
            Effect.annotateLogs({
              infoHash,
              error: String(cause),
            }),
          )
      ),
    );
  });

  const reconcileCompletedTorrentEffect = Effect.fn(
    "OperationsService.reconcileCompletedTorrent",
  )(function* (infoHash: string, contentPath: string | undefined) {
    if (!contentPath) {
      return;
    }

    const rows = yield* tryDatabasePromise(
      "Failed to reconcile completed download",
      () =>
        db.select().from(downloads).where(eq(downloads.infoHash, infoHash))
          .limit(1),
    );
    const row = rows[0];

    if (!row) {
      return;
    }

    if (row.reconciledAt) {
      return;
    }

    const animeRow = yield* tryOperationsPromise(
      "Failed to reconcile completed download",
      () => requireAnime(db, row.animeId),
    );
    const importMode = yield* tryDatabasePromise(
      "Failed to reconcile completed download",
      () => currentImportMode(db),
    );
    const runtimeConfig = yield* tryDatabasePromise(
      "Failed to reconcile completed download",
      () => loadRuntimeConfig(db),
    );
    const resolvedContentRoot = yield* tryDatabasePromise(
      "Failed to reconcile completed download",
      () =>
        resolveAccessibleDownloadPath(
          fs,
          contentPath,
          runtimeConfig.downloads.remote_path_mappings,
        ),
    );

    if (!resolvedContentRoot) {
      return;
    }

    const claimResult = yield* tryDatabasePromise(
      "Failed to reconcile completed download",
      async () => {
        const result = await db
          .update(downloads)
          .set({ reconciledAt: nowIso() })
          .where(
            and(eq(downloads.id, row.id), isNull(downloads.reconciledAt)),
          )
          .returning({ id: downloads.id });
        return result.length > 0;
      },
    );

    if (!claimResult) {
      return;
    }

    if (row.isBatch) {
      const coveredEpisodes = parseCoveredEpisodes(row.coveredEpisodes);
      const batchPaths = yield* tryDatabasePromise(
        "Failed to reconcile completed download",
        () => resolveBatchContentPaths(fs, resolvedContentRoot),
      );

      if (batchPaths.length > 0) {
        for (const path of batchPaths) {
          const episodeNumber = parseEpisodeNumber(path);

          if (!episodeNumber) {
            continue;
          }

          if (
            coveredEpisodes.length > 0 &&
            !coveredEpisodes.includes(episodeNumber)
          ) {
            continue;
          }

          const existingEpisode = yield* tryDatabasePromise(
            "Failed to reconcile completed download",
            () =>
              db.select().from(episodes).where(
                and(
                  eq(episodes.animeId, row.animeId),
                  eq(episodes.number, episodeNumber),
                ),
              ).limit(1),
          );

          if (existingEpisode[0]?.downloaded && existingEpisode[0]?.filePath) {
            continue;
          }

          const managedPath = yield* tryOperationsPromise(
            "Failed to reconcile completed download",
            () =>
              importDownloadedFile(
                fs,
                animeRow,
                episodeNumber,
                path,
                importMode,
              ),
          );
          yield* tryDatabasePromise(
            "Failed to reconcile completed download",
            () =>
              upsertEpisodeFile(db, row.animeId, episodeNumber, managedPath),
          );
        }

        yield* tryDatabasePromise(
          "Failed to reconcile completed download",
          () => markDownloadImported(db, row.id),
        );
        yield* maybeCleanupImportedTorrent(runtimeConfig, row.infoHash);
        yield* tryDatabasePromise(
          "Failed to reconcile completed download",
          () =>
            recordDownloadEvent(db, {
              animeId: row.animeId,
              downloadId: row.id,
              eventType: "download.imported.batch",
              fromStatus: row.status,
              message: `Imported batch torrent for ${row.animeTitle}`,
              toStatus: "imported",
            }),
        );
        yield* tryDatabasePromise(
          "Failed to reconcile completed download",
          () =>
            appendLog(
              db,
              "downloads.reconciled.batch",
              "success",
              `Mapped completed batch torrent for ${row.animeTitle}`,
            ),
        );
        return;
      }
    }

    const existingEpisode = yield* tryDatabasePromise(
      "Failed to reconcile completed download",
      () =>
        db.select().from(episodes).where(
          and(
            eq(episodes.animeId, row.animeId),
            eq(episodes.number, row.episodeNumber),
          ),
        ).limit(1),
    );

    if (existingEpisode[0]?.downloaded && existingEpisode[0]?.filePath) {
      yield* tryDatabasePromise(
        "Failed to reconcile completed download",
        () => markDownloadImported(db, row.id),
      );
      return;
    }

    const resolvedPath = yield* tryDatabasePromise(
      "Failed to reconcile completed download",
      () =>
        resolveCompletedContentPath(fs, resolvedContentRoot, row.episodeNumber),
    );

    if (!resolvedPath) {
      yield* tryDatabasePromise(
        "Failed to reconcile completed download",
        () => markDownloadImported(db, row.id),
      );
      return;
    }

    const managedPath = yield* tryOperationsPromise(
      "Failed to reconcile completed download",
      () =>
        importDownloadedFile(
          fs,
          animeRow,
          row.episodeNumber,
          resolvedPath,
          importMode,
        ),
    );
    yield* tryDatabasePromise(
      "Failed to reconcile completed download",
      () => upsertEpisodeFile(db, row.animeId, row.episodeNumber, managedPath),
    );
    yield* tryDatabasePromise(
      "Failed to reconcile completed download",
      () => markDownloadImported(db, row.id),
    );
    yield* maybeCleanupImportedTorrent(runtimeConfig, row.infoHash);
    yield* tryDatabasePromise(
      "Failed to reconcile completed download",
      () =>
        recordDownloadEvent(db, {
          animeId: row.animeId,
          downloadId: row.id,
          eventType: "download.imported",
          fromStatus: row.status,
          message: `Imported ${row.animeTitle} episode ${row.episodeNumber}`,
          toStatus: "imported",
        }),
    );
    yield* tryDatabasePromise(
      "Failed to reconcile completed download",
      () =>
        appendLog(
          db,
          "downloads.reconciled",
          "success",
          `Mapped completed torrent for ${row.animeTitle} episode ${row.episodeNumber}`,
        ),
    );
  });

  const syncDownloadsWithQBitEffect = Effect.fn(
    "OperationsService.syncDownloadsWithQBit",
  )(function* () {
    return yield* Effect.gen(function* () {
      const config = yield* tryDatabasePromise(
        "Failed to sync downloads with qBittorrent",
        () => loadRuntimeConfig(db),
      ).pipe(Effect.catchAll(() => Effect.succeed<Config | null>(null)));
      const qbitConfig = config ? maybeQBitConfig(config) : null;

      if (!qbitConfig) {
        return;
      }

      const torrents = yield* qbitClient.listTorrents(qbitConfig).pipe(
        Effect.catchAll(() => Effect.succeed<readonly QBitTorrent[]>([])),
      );

      for (const torrent of torrents) {
        const status = mapQBitState(torrent.state);
        const existingRows = yield* tryDatabasePromise(
          "Failed to sync downloads with qBittorrent",
          () =>
            db.select().from(downloads).where(
              eq(downloads.infoHash, torrent.hash.toLowerCase()),
            ).limit(1),
        );
        const existing = existingRows[0];

        yield* tryDatabasePromise(
          "Failed to sync downloads with qBittorrent",
          () =>
            db.update(downloads).set({
              contentPath: torrent.content_path ?? null,
              downloadDate: status === "completed" ? nowIso() : null,
              downloadedBytes: torrent.downloaded,
              errorMessage: status === "error"
                ? `qBittorrent state: ${torrent.state}`
                : null,
              etaSeconds: torrent.eta,
              externalState: torrent.state,
              lastErrorAt: status === "error" ? nowIso() : null,
              lastSyncedAt: nowIso(),
              progress: Math.round(torrent.progress * 100),
              savePath: torrent.save_path ?? null,
              speedBytes: torrent.dlspeed,
              status,
              totalBytes: torrent.size,
            }).where(eq(downloads.infoHash, torrent.hash.toLowerCase())),
        );

        if (existing && existing.status !== status) {
          yield* tryDatabasePromise(
            "Failed to sync downloads with qBittorrent",
            () =>
              recordDownloadEvent(db, {
                animeId: existing.animeId,
                downloadId: existing.id,
                eventType: "download.status_changed",
                fromStatus: existing.status,
                message: `${existing.torrentName} moved to ${status}`,
                toStatus: status,
              }),
          );
        }

        if (
          status === "completed" && shouldReconcileCompletedDownloads(config)
        ) {
          yield* reconcileCompletedTorrentEffect(
            torrent.hash.toLowerCase(),
            torrent.content_path ?? torrent.save_path,
          );
        }
      }
    }).pipe(Effect.withSpan("operations.downloads.sync_qbit"));
  });

  const getDownloadProgressSnapshotEffect = Effect.fn(
    "OperationsService.getDownloadProgressSnapshot",
  )(function* () {
    yield* syncDownloadsWithQBitEffect();
    const rows = yield* tryDatabasePromise(
      "Failed to load download progress snapshot",
      () =>
        db.select().from(downloads).where(
          inArray(downloads.status, ["queued", "downloading", "paused"]),
        ).orderBy(desc(downloads.id)),
    );
    return rows.map((row) => toDownloadStatus(row, () => randomHex(20)));
  });

  const publishDownloadProgress = Effect.fn(
    "OperationsService.publishDownloadProgress",
  )(function* () {
    const downloads = yield* getDownloadProgressSnapshotEffect().pipe(
      Effect.catchAll((error) =>
        error instanceof DatabaseError ? Effect.fail(error) : Effect.fail(
          dbError("Failed to load download progress snapshot")(error),
        )
      ),
    );

    yield* eventBus.publish({
      type: "DownloadProgress",
      payload: { downloads },
    });
  });

  const syncDownloadState = Effect.fn("OperationsService.syncDownloadState")(
    function* (trigger: string) {
      return yield* Effect.gen(function* () {
        const startedAt = performance.now();

        yield* syncDownloadsWithQBitEffect().pipe(
          Effect.catchAll((error) =>
            error instanceof DatabaseError ? Effect.fail(error) : Effect.fail(
              dbError("Failed to sync downloads with qBittorrent")(error),
            )
          ),
        );

        yield* Effect.logInfo("download state sync completed").pipe(
          Effect.annotateLogs({
            component: "downloads",
            durationMs: durationMsSince(startedAt),
            syncTrigger: trigger,
          }),
        );
      }).pipe(Effect.withSpan("operations.downloads.sync_state"));
    },
  );

  const applyDownloadActionEffect = Effect.fn(
    "OperationsService.applyDownloadAction",
  )(function* (
    id: number,
    action: "pause" | "resume" | "delete",
    deleteFiles = false,
  ) {
    const rows = yield* tryDatabasePromise(
      `Failed to ${action} download`,
      () => db.select().from(downloads).where(eq(downloads.id, id)).limit(1),
    );
    const row = rows[0];

    if (!row) {
      return yield* new DownloadNotFoundError({
        message: "Download not found",
      });
    }

    const runtimeConfig = yield* tryDatabasePromise(
      `Failed to ${action} download`,
      () => loadRuntimeConfig(db),
    );
    const qbitConfig = maybeQBitConfig(runtimeConfig);

    if (qbitConfig && row!.infoHash) {
      if (action === "pause") {
        yield* qbitClient.pauseTorrent(qbitConfig, row!.infoHash).pipe(
          Effect.mapError(wrapOperationsError("Failed to pause download")),
        );
      } else if (action === "resume") {
        yield* qbitClient.resumeTorrent(qbitConfig, row!.infoHash).pipe(
          Effect.mapError(wrapOperationsError("Failed to resume download")),
        );
      } else {
        yield* qbitClient.deleteTorrent(qbitConfig, row!.infoHash, deleteFiles)
          .pipe(
            Effect.mapError(wrapOperationsError("Failed to remove download")),
          );
      }
    }

    if (action === "delete") {
      yield* tryDatabasePromise(
        "Failed to remove download",
        () =>
          recordDownloadEvent(db, {
            animeId: row!.animeId,
            downloadId: row!.id,
            eventType: "download.deleted",
            fromStatus: row!.status,
            message: `Deleted ${row!.torrentName}`,
            toStatus: "deleted",
          }),
      );
      yield* tryDatabasePromise(
        "Failed to remove download",
        () => db.delete(downloads).where(eq(downloads.id, id)),
      );
      return;
    }

    yield* tryDatabasePromise(
      `Failed to ${action} download`,
      () =>
        db.update(downloads).set({
          externalState: action,
          status: action === "pause" ? "paused" : "downloading",
        }).where(eq(downloads.id, id)),
    );

    yield* tryDatabasePromise(
      `Failed to ${action} download`,
      () =>
        recordDownloadEvent(db, {
          animeId: row!.animeId,
          downloadId: row!.id,
          eventType: `download.${action}d`,
          fromStatus: row!.status,
          message: `${action === "pause" ? "Paused" : "Resumed"} ${
            row!.torrentName
          }`,
          toStatus: action === "pause" ? "paused" : "downloading",
        }),
    );
  });

  const retryDownloadById = Effect.fn("OperationsService.retryDownloadById")(
    function* (id: number) {
      const rows = yield* tryDatabasePromise(
        "Failed to retry download",
        () => db.select().from(downloads).where(eq(downloads.id, id)).limit(1),
      );
      const row = rows[0];

      if (!row) {
        return yield* new DownloadNotFoundError({
          message: "Download not found",
        });
      }

      if (!row!.magnet) {
        return yield* new DownloadConflictError({
          message: "Download cannot be retried without a magnet link",
        });
      }

      const runtimeConfig = yield* tryDatabasePromise(
        "Failed to retry download",
        () => loadRuntimeConfig(db),
      );
      const qbitConfig = maybeQBitConfig(runtimeConfig);

      if (qbitConfig) {
        yield* qbitClient.addTorrentUrl(qbitConfig, row!.magnet!).pipe(
          Effect.mapError(wrapOperationsError("Failed to retry download")),
        );
      }

      yield* tryDatabasePromise(
        "Failed to retry download",
        () =>
          db.update(downloads).set({
            errorMessage: null,
            externalState: qbitConfig ? "downloading" : "queued",
            lastErrorAt: null,
            lastSyncedAt: nowIso(),
            progress: 0,
            retryCount: sql`${downloads.retryCount} + 1`,
            status: qbitConfig ? "downloading" : "queued",
          }).where(eq(downloads.id, id)),
      );

      yield* tryDatabasePromise(
        "Failed to retry download",
        () =>
          recordDownloadEvent(db, {
            animeId: row!.animeId,
            downloadId: row!.id,
            eventType: "download.retried",
            fromStatus: row!.status,
            message: `Retried ${row!.torrentName}`,
            toStatus: qbitConfig ? "downloading" : "queued",
          }),
      );
    },
  );

  const reconcileDownloadByIdEffect = Effect.fn(
    "OperationsService.reconcileDownloadById",
  )(function* (id: number) {
    const rows = yield* tryDatabasePromise(
      "Failed to reconcile download",
      () => db.select().from(downloads).where(eq(downloads.id, id)).limit(1),
    );
    const row = rows[0];

    if (!row) {
      return yield* new DownloadNotFoundError({
        message: "Download not found",
      });
    }

    const contentPath = row!.contentPath ?? row!.savePath;

    if (!contentPath || !row!.infoHash) {
      return yield* new DownloadConflictError({
        message: "Download has no reconciliable content path",
      });
    }

    yield* reconcileCompletedTorrentEffect(
      row!.infoHash!,
      contentPath ?? undefined,
    );
  });

  const triggerDownload = Effect.fn("OperationsService.triggerDownload")(
    function* (input: {
      anime_id: number;
      magnet: string;
      episode_number: number;
      title: string;
      group?: string;
      info_hash?: string;
      is_batch?: boolean;
    }) {
      return yield* triggerSemaphore.withPermits(1)(
        Effect.gen(function* () {
          const animeRow = yield* tryOperationsPromise(
            "Failed to trigger download",
            () => requireAnime(db, input.anime_id),
          );
          const now = nowIso();
          const runtimeConfig = yield* tryOperationsPromise(
            "Failed to trigger download",
            () => loadRuntimeConfig(db),
          );
          const parsedRelease = parseReleaseName(input.title);
          const missingEpisodes = yield* tryDatabasePromise(
            "Failed to trigger download",
            () => loadMissingEpisodeNumbers(db, animeRow.id),
          );
          const coveredEpisodes = toCoveredEpisodesJson(
            inferCoveredEpisodeNumbers({
              explicitEpisodes: parsedRelease.episodeNumbers,
              isBatch: input.is_batch ?? parsedRelease.isBatch,
              missingEpisodes,
              requestedEpisode: input.episode_number,
            }),
          );
          const infoHash =
            (input.info_hash ?? parseMagnetInfoHash(input.magnet))
              ?.toLowerCase() ?? null;

          const insertResult = yield* Effect.either(tryDatabasePromise(
            "Failed to trigger download",
            () =>
              db.insert(downloads).values({
                addedAt: now,
                animeId: animeRow.id,
                animeTitle: animeRow.titleRomaji,
                contentPath: null,
                coveredEpisodes,
                downloadDate: null,
                episodeNumber: input.episode_number,
                isBatch: input.is_batch ?? parsedRelease.isBatch,
                downloadedBytes: 0,
                errorMessage: null,
                etaSeconds: null,
                externalState: "queued",
                groupName: input.group ?? null,
                infoHash,
                lastSyncedAt: now,
                magnet: input.magnet,
                progress: 0,
                savePath: null,
                speedBytes: 0,
                status: "queued",
                totalBytes: null,
                torrentName: input.title,
              }).returning({ id: downloads.id }),
          ));

          if (insertResult._tag === "Left") {
            const dbError = insertResult.left;
            if (
              dbError instanceof DatabaseError && dbError.isUniqueConstraint()
            ) {
              return yield* new DownloadConflictError({
                message: "Download already exists",
              });
            }
            return yield* dbError;
          }

          const insertedId = insertResult.right[0].id;
          let status = "queued";
          const qbitConfig = maybeQBitConfig(runtimeConfig);

          if (qbitConfig && input.magnet) {
            const qbitResult = yield* Effect.either(
              qbitClient.addTorrentUrl(qbitConfig, input.magnet),
            );

            if (qbitResult._tag === "Left") {
              yield* tryDatabasePromise(
                "Cleanup failed download",
                () => db.delete(downloads).where(eq(downloads.id, insertedId)),
              );
              return yield* wrapOperationsError("Failed to trigger download")(
                qbitResult.left,
              );
            }

            status = "downloading";
            yield* tryDatabasePromise(
              "Update download status",
              () =>
                db.update(downloads).set({ status, externalState: status })
                  .where(eq(downloads.id, insertedId)),
            );
          }
          yield* tryDatabasePromise(
            "Failed to trigger download",
            () =>
              recordDownloadEvent(db, {
                animeId: animeRow.id,
                eventType: "download.queued",
                message: `Queued ${input.title}`,
                metadata: coveredEpisodes,
                toStatus: status,
              }),
          );
          yield* tryDatabasePromise(
            "Failed to trigger download",
            () =>
              appendLog(
                db,
                "downloads.triggered",
                "success",
                `Queued download for ${animeRow.titleRomaji} episode ${input.episode_number}`,
              ),
          );
          yield* eventBus.publish({
            type: "DownloadStarted",
            payload: { anime_id: animeRow.id, title: input.title },
          });
          yield* publishDownloadProgress();
        }).pipe(Effect.withSpan("operations.downloads.trigger")),
      );
    },
  );

  return {
    applyDownloadActionEffect,
    getDownloadProgressSnapshotEffect,
    maybeCleanupImportedTorrent,
    publishDownloadProgress,
    reconcileCompletedTorrentEffect,
    reconcileDownloadByIdEffect,
    retryDownloadById,
    syncDownloadState,
    syncDownloadsWithQBitEffect,
    triggerDownload,
  };
}

function mapQBitState(state: string): string {
  const value = state.toLowerCase();
  if (
    value.includes("downloading") || value.includes("forceddl") ||
    value.includes("metadl")
  ) {
    return "downloading";
  }
  if (value.includes("queued")) {
    return "queued";
  }
  if (value.includes("paused")) {
    return "paused";
  }
  if (
    value.includes("upload") || value.includes("stalledup") ||
    value.includes("completed")
  ) {
    return "completed";
  }
  if (value.includes("error") || value.includes("missing")) {
    return "error";
  }
  return "queued";
}
