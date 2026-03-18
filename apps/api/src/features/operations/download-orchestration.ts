import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { Effect } from "effect";

import type {
  Config,
  DownloadSourceMetadata,
} from "../../../../../packages/shared/src/index.ts";
import type { AppDatabase } from "../../db/database.ts";
import { DatabaseError } from "../../db/database.ts";
import { downloads, episodes } from "../../db/schema.ts";
import { durationMsSince } from "../../lib/logging.ts";
import { EventBus } from "../events/event-bus.ts";
import {
  currentImportMode,
  decodeDownloadSourceMetadata,
  encodeDownloadSourceMetadata,
  loadDownloadPresentationContexts,
  loadRuntimeConfig,
  requireAnime,
  toDownloadStatus,
} from "./repository.ts";
import {
  buildDownloadSourceMetadataFromRelease,
  buildEpisodeFilenamePlan,
  hasMissingLocalMediaNamingFields,
  mergeDownloadSourceMetadata,
  selectNamingFormat,
} from "./naming-support.ts";
import type { MediaProbeShape } from "../../lib/media-probe.ts";
import {
  importDownloadedFile,
  shouldDeleteImportedData,
  shouldReconcileCompletedDownloads,
  shouldRemoveTorrentOnImport,
  upsertEpisodeFile,
  upsertEpisodeFiles,
} from "./download-support.ts";
import { classifyMediaArtifact } from "../../lib/media-identity.ts";
import {
  hasOverlappingDownload,
  inferCoveredEpisodeNumbers,
  inferCoveredEpisodesFromTorrentContents,
  parseCoveredEpisodes,
  parseMagnetInfoHash,
  resolveAccessibleDownloadPath,
  resolveBatchContentPaths,
  resolveCompletedContentPath,
  resolveReconciledBatchEpisodeNumbers,
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
  ExternalCallError,
  type OperationsError,
  OperationsInputError,
  OperationsPathError,
} from "./errors.ts";
import type { FileSystemShape } from "../../lib/filesystem.ts";
import type {
  TryDatabasePromise,
  TryOperationsPromise,
} from "./service-support.ts";
import type { QBitConfig, QBitTorrentClient } from "./qbittorrent.ts";

export function makeDownloadOrchestration(input: {
  db: AppDatabase;
  fs: FileSystemShape;
  mediaProbe: MediaProbeShape;
  qbitClient: typeof QBitTorrentClient.Service;
  eventBus: typeof EventBus.Service;
  tryDatabasePromise: TryDatabasePromise;
  tryOperationsPromise: TryOperationsPromise;
  wrapOperationsError: (
    message: string,
  ) => (cause: unknown) => ExternalCallError | OperationsError | DatabaseError;
  dbError: (message: string) => (cause: unknown) => DatabaseError;
  maybeQBitConfig: (config: Config) => QBitConfig | null;
  triggerSemaphore: Effect.Semaphore;
}) {
  const {
    db,
    fs,
    mediaProbe,
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
      Effect.catchTags({
        ExternalCallError: (cause) =>
          Effect.logWarning(
            "Failed to delete imported torrent from qBittorrent",
          )
            .pipe(
              Effect.annotateLogs({
                infoHash,
                error: String(cause),
              }),
            ),
        QBitTorrentClientError: (cause) =>
          Effect.logWarning(
            "Failed to delete imported torrent from qBittorrent",
          )
            .pipe(
              Effect.annotateLogs({
                infoHash,
                error: String(cause),
              }),
            ),
      }),
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

    const storedSourceMetadata = decodeDownloadSourceMetadata(
      row.sourceMetadata,
    );

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
    const resolvedContentRoot = yield* resolveAccessibleDownloadPath(
      fs,
      contentPath,
      runtimeConfig.downloads.remote_path_mappings,
    );

    if (!resolvedContentRoot) {
      return;
    }

    if (row.isBatch) {
      const coveredEpisodes = parseCoveredEpisodes(row.coveredEpisodes);
      const batchPaths = yield* resolveBatchContentPaths(
        fs,
        resolvedContentRoot,
      ).pipe(
        Effect.mapError(() =>
          new OperationsPathError({
            message:
              `Download content path is inaccessible: ${resolvedContentRoot}`,
          })
        ),
      );

      if (batchPaths.length > 0) {
        const accountedEpisodes = new Set<number>();
        const expectedEpisodeCount = coveredEpisodes.length > 0
          ? new Set(coveredEpisodes).size
          : undefined;
        let alreadyImportedCount = 0;
        let importedCount = 0;

        for (const path of batchPaths) {
          const fileName = path.substring(path.lastIndexOf("/") + 1);
          const classification = classifyMediaArtifact(path, fileName);
          if (
            classification.kind === "extra" ||
            classification.kind === "sample"
          ) {
            continue;
          }

          const episodeNumbers = resolveReconciledBatchEpisodeNumbers({
            coveredEpisodes,
            path,
            totalCandidateCount: batchPaths.length,
          });
          if (episodeNumbers.length === 0) {
            continue;
          }

          const relevantEpisodes = coveredEpisodes.length > 0
            ? episodeNumbers.filter((ep) => coveredEpisodes.includes(ep))
            : episodeNumbers;

          if (relevantEpisodes.length === 0) {
            continue;
          }

          for (const ep of relevantEpisodes) {
            accountedEpisodes.add(ep);
          }

          const primaryEpisode = relevantEpisodes[0];
          const namingFormat = selectNamingFormat(animeRow, {
            movieNamingFormat: runtimeConfig.library.movie_naming_format,
            namingFormat: runtimeConfig.library.naming_format,
          });
          const episodeRows = yield* tryDatabasePromise(
            "Failed to reconcile completed download",
            () =>
              db.select({ aired: episodes.aired, title: episodes.title }).from(
                episodes,
              ).where(
                and(
                  eq(episodes.animeId, row.animeId),
                  inArray(episodes.number, relevantEpisodes),
                ),
              ),
          );
          const initialNamingPlan = buildEpisodeFilenamePlan({
            animeRow,
            downloadSourceMetadata: storedSourceMetadata,
            episodeNumbers: relevantEpisodes,
            episodeRows,
            filePath: path,
            namingFormat,
            preferredTitle: runtimeConfig.library.preferred_title,
          });
          const localMediaMetadata = hasMissingLocalMediaNamingFields(
              initialNamingPlan.missingFields,
            )
            ? yield* mediaProbe.probeVideoFile(path)
            : undefined;

          const existingEpisode = yield* tryDatabasePromise(
            "Failed to reconcile completed download",
            () =>
              db.select().from(episodes).where(
                and(
                  eq(episodes.animeId, row.animeId),
                  eq(episodes.number, primaryEpisode),
                ),
              ).limit(1),
          );

          if (existingEpisode[0]?.downloaded && existingEpisode[0]?.filePath) {
            alreadyImportedCount += 1;
            continue;
          }

          const managedPath = yield* importDownloadedFile(
            fs,
            animeRow,
            primaryEpisode,
            path,
            importMode,
            {
              downloadSourceMetadata: storedSourceMetadata,
              episodeNumbers: relevantEpisodes,
              episodeRows,
              localMediaMetadata,
              namingFormat,
              preferredTitle: runtimeConfig.library.preferred_title,
            },
          ).pipe(
            Effect.mapError(
              wrapOperationsError("Failed to reconcile completed download"),
            ),
          );
          yield* tryDatabasePromise(
            "Failed to reconcile completed download",
            () =>
              upsertEpisodeFiles(
                db,
                row.animeId,
                relevantEpisodes,
                managedPath,
              ),
          );
          importedCount += 1;
        }

        const batchAlreadyImported = importedCount === 0 &&
          accountedEpisodes.size > 0 &&
          alreadyImportedCount === accountedEpisodes.size &&
          (
            expectedEpisodeCount === undefined ||
            accountedEpisodes.size === expectedEpisodeCount
          );

        if (importedCount === 0 && !batchAlreadyImported) {
          yield* Effect.logWarning(
            "Batch reconciliation skipped all files; leaving unreconciled for retry",
          ).pipe(
            Effect.annotateLogs({
              animeTitle: row.animeTitle,
              downloadId: row.id,
            }),
          );
          return;
        }

        yield* tryDatabasePromise(
          "Failed to reconcile completed download",
          async () => {
            await markDownloadImported(db, row.id);
            await db
              .update(downloads)
              .set({ reconciledAt: nowIso() })
              .where(eq(downloads.id, row.id));
          },
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
              metadataJson: {
                covered_episodes: parseCoveredEpisodes(row.coveredEpisodes),
                imported_path: animeRow.rootFolder,
                source_metadata: storedSourceMetadata,
              },
              message: batchAlreadyImported
                ? `Reconciled already-imported batch torrent for ${row.animeTitle}`
                : `Imported batch torrent for ${row.animeTitle}`,
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
              batchAlreadyImported
                ? `Marked already-imported batch torrent as reconciled for ${row.animeTitle}`
                : `Mapped completed batch torrent for ${row.animeTitle}`,
            ),
        );
        yield* eventBus.publish({
          type: "DownloadFinished",
          payload: {
            anime_id: row.animeId,
            imported_path: animeRow.rootFolder,
            source_metadata: storedSourceMetadata,
            title: row.torrentName,
          },
        });
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
        async () => {
          await markDownloadImported(db, row.id);
          await db
            .update(downloads)
            .set({ reconciledAt: nowIso() })
            .where(eq(downloads.id, row.id));
        },
      );
      return;
    }

    const expectedAirDate = existingEpisode[0]?.aired ??
      storedSourceMetadata?.air_date ??
      (storedSourceMetadata?.source_identity?.scheme === "daily"
        ? storedSourceMetadata.source_identity.air_dates?.[0]
        : undefined);

    const resolvedPath = yield* resolveCompletedContentPath(
      fs,
      resolvedContentRoot,
      row.episodeNumber,
      { expectedAirDate },
    ).pipe(
      Effect.mapError(() =>
        new OperationsPathError({
          message:
            `Download content path is inaccessible: ${resolvedContentRoot}`,
        })
      ),
    );

    if (!resolvedPath) {
      return;
    }

    const namingFormat = selectNamingFormat(animeRow, {
      movieNamingFormat: runtimeConfig.library.movie_naming_format,
      namingFormat: runtimeConfig.library.naming_format,
    });
    const episodeRows = yield* tryDatabasePromise(
      "Failed to reconcile completed download",
      () =>
        db.select({ aired: episodes.aired, title: episodes.title }).from(
          episodes,
        ).where(
          and(
            eq(episodes.animeId, row.animeId),
            eq(episodes.number, row.episodeNumber),
          ),
        ),
    );
    const initialNamingPlan = buildEpisodeFilenamePlan({
      animeRow,
      downloadSourceMetadata: storedSourceMetadata,
      episodeNumbers: [row.episodeNumber],
      episodeRows,
      filePath: resolvedPath,
      namingFormat,
      preferredTitle: runtimeConfig.library.preferred_title,
    });
    const localMediaMetadata = hasMissingLocalMediaNamingFields(
        initialNamingPlan.missingFields,
      )
      ? yield* mediaProbe.probeVideoFile(resolvedPath)
      : undefined;

    const managedPath = yield* importDownloadedFile(
      fs,
      animeRow,
      row.episodeNumber,
      resolvedPath,
      importMode,
      {
        downloadSourceMetadata: storedSourceMetadata,
        episodeRows,
        localMediaMetadata,
        namingFormat,
        preferredTitle: runtimeConfig.library.preferred_title,
      },
    ).pipe(
      Effect.mapError(
        wrapOperationsError("Failed to reconcile completed download"),
      ),
    );
    yield* tryDatabasePromise(
      "Failed to reconcile completed download",
      () => upsertEpisodeFile(db, row.animeId, row.episodeNumber, managedPath),
    );
    yield* tryDatabasePromise(
      "Failed to reconcile completed download",
      async () => {
        await markDownloadImported(db, row.id);
        await db
          .update(downloads)
          .set({ reconciledAt: nowIso() })
          .where(eq(downloads.id, row.id));
      },
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
          metadataJson: {
            covered_episodes: parseCoveredEpisodes(row.coveredEpisodes),
            imported_path: managedPath,
            source_metadata: storedSourceMetadata,
          },
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
    yield* eventBus.publish({
      type: "DownloadFinished",
      payload: {
        anime_id: row.animeId,
        imported_path: managedPath,
        source_metadata: storedSourceMetadata,
        title: row.torrentName,
      },
    });
  });

  const syncDownloadsWithQBitEffect = Effect.fn(
    "OperationsService.syncDownloadsWithQBit",
  )(function* () {
    return yield* Effect.gen(function* () {
      const config = yield* tryDatabasePromise(
        "Failed to sync downloads with qBittorrent",
        () => loadRuntimeConfig(db),
      );
      const qbitConfig = maybeQBitConfig(config);

      if (!qbitConfig) {
        return;
      }

      const torrentsResult = yield* qbitClient.listTorrents(qbitConfig).pipe(
        Effect.either,
      );

      if (torrentsResult._tag === "Left") {
        yield* Effect.logWarning(
          "qBittorrent unreachable, skipping download sync",
        ).pipe(
          Effect.annotateLogs({ error: String(torrentsResult.left) }),
        );
        return;
      }

      const torrents = torrentsResult.right;

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
        const preservedImported = Boolean(existing?.reconciledAt);
        const nextStatus = preservedImported ? "imported" : status;
        const nextExternalState = preservedImported
          ? (existing?.externalState ?? "imported")
          : torrent.state;
        const nextDownloadDate = preservedImported
          ? (existing?.downloadDate ?? nowIso())
          : status === "completed"
          ? nowIso()
          : null;

        yield* tryDatabasePromise(
          "Failed to sync downloads with qBittorrent",
          () =>
            db.update(downloads).set({
              contentPath: torrent.content_path ?? null,
              downloadDate: nextDownloadDate,
              downloadedBytes: torrent.downloaded,
              errorMessage: preservedImported
                ? null
                : status === "error"
                ? `qBittorrent state: ${torrent.state}`
                : null,
              etaSeconds: torrent.eta,
              externalState: nextExternalState,
              lastErrorAt: preservedImported || status !== "error"
                ? null
                : nowIso(),
              lastSyncedAt: nowIso(),
              progress: Math.round(torrent.progress * 100),
              savePath: torrent.save_path ?? null,
              speedBytes: torrent.dlspeed,
              status: nextStatus,
              totalBytes: torrent.size,
            }).where(eq(downloads.infoHash, torrent.hash.toLowerCase())),
        );

        if (existing && existing.isBatch && !preservedImported) {
          yield* refineBatchCoverageFromTorrentFiles({
            animeId: existing.animeId,
            downloadId: existing.id,
            existingCoveredEpisodes: existing.coveredEpisodes,
            infoHash: torrent.hash.toLowerCase(),
            qbitConfig,
            sourceMetadata: decodeDownloadSourceMetadata(
              existing.sourceMetadata,
            ),
            torrentName: torrent.name,
          });
        }

        if (existing && existing.status !== nextStatus) {
          yield* tryDatabasePromise(
            "Failed to sync downloads with qBittorrent",
            () =>
              recordDownloadEvent(db, {
                animeId: existing.animeId,
                downloadId: existing.id,
                eventType: "download.status_changed",
                fromStatus: existing.status,
                metadataJson: {
                  covered_episodes: parseCoveredEpisodes(
                    existing.coveredEpisodes,
                  ),
                  source_metadata: decodeDownloadSourceMetadata(
                    existing.sourceMetadata,
                  ),
                },
                message: `${existing.torrentName} moved to ${nextStatus}`,
                toStatus: nextStatus,
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
    const contexts = yield* tryDatabasePromise(
      "Failed to load download progress snapshot",
      () => loadDownloadPresentationContexts(db, rows),
    );
    return rows.map((row) =>
      toDownloadStatus(row, () => randomHex(20), contexts.get(row.id))
    );
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

  const refineBatchCoverageFromTorrentFiles = Effect.fn(
    "OperationsService.refineBatchCoverageFromTorrentFiles",
  )(function* (input: {
    animeId: number;
    downloadId: number;
    existingCoveredEpisodes: string | null;
    infoHash: string;
    qbitConfig: QBitConfig | null;
    sourceMetadata?: DownloadSourceMetadata;
    torrentName: string;
  }) {
    if (!input.qbitConfig) {
      return;
    }

    const contentsResult = yield* qbitClient.listTorrentContents(
      input.qbitConfig,
      input.infoHash,
    ).pipe(Effect.either);

    if (contentsResult._tag === "Left") {
      yield* Effect.logDebug("Failed to inspect qBittorrent file list").pipe(
        Effect.annotateLogs({
          downloadId: input.downloadId,
          error: String(contentsResult.left),
          infoHash: input.infoHash,
        }),
      );
      return;
    }

    const inferredEpisodes = inferCoveredEpisodesFromTorrentContents({
      files: contentsResult.right,
      rootName: input.torrentName,
    });

    if (inferredEpisodes.length === 0) {
      return;
    }

    const currentEpisodes = parseCoveredEpisodes(input.existingCoveredEpisodes);
    if (
      currentEpisodes.length === inferredEpisodes.length &&
      currentEpisodes.every((episode, index) =>
        episode === inferredEpisodes[index]
      )
    ) {
      return;
    }

    yield* tryDatabasePromise(
      "Failed to sync downloads with qBittorrent",
      () =>
        db.update(downloads).set({
          coveredEpisodes: toCoveredEpisodesJson(inferredEpisodes),
          episodeNumber: inferredEpisodes[0] ?? 1,
          isBatch: inferredEpisodes.length > 1,
        }).where(eq(downloads.id, input.downloadId)),
    );

    yield* tryDatabasePromise(
      "Failed to sync downloads with qBittorrent",
      () =>
        recordDownloadEvent(db, {
          animeId: input.animeId,
          downloadId: input.downloadId,
          eventType: "download.coverage_refined",
          metadataJson: {
            covered_episodes: inferredEpisodes,
            source_metadata: input.sourceMetadata,
          },
          message: `Refined batch episodes from qBittorrent file list: ${
            inferredEpisodes.join(", ")
          }`,
          metadata: toCoveredEpisodesJson(inferredEpisodes),
        }),
    );
  });

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
            metadataJson: {
              covered_episodes: parseCoveredEpisodes(row!.coveredEpisodes),
              source_metadata: decodeDownloadSourceMetadata(
                row!.sourceMetadata,
              ),
            },
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
          metadataJson: {
            covered_episodes: parseCoveredEpisodes(row!.coveredEpisodes),
            source_metadata: decodeDownloadSourceMetadata(
              row!.sourceMetadata,
            ),
          },
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
            metadataJson: {
              covered_episodes: parseCoveredEpisodes(row!.coveredEpisodes),
              source_metadata: decodeDownloadSourceMetadata(
                row!.sourceMetadata,
              ),
            },
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
      episode_number?: number;
      title: string;
      group?: string;
      info_hash?: string;
      is_batch?: boolean;
      decision_reason?: string;
      release_metadata?: DownloadSourceMetadata;
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
          const effectiveIsBatch = input.is_batch ?? parsedRelease.isBatch;
          const requestedEpisode = resolveRequestedEpisodeNumber({
            explicitEpisode: input.episode_number,
            inferredEpisodes: parsedRelease.episodeNumbers,
            isBatch: effectiveIsBatch,
          });

          if (!requestedEpisode) {
            return yield* new OperationsInputError({
              message:
                "episode_number is required when the release title does not include episode information",
            });
          }

          const missingEpisodes = yield* tryDatabasePromise(
            "Failed to trigger download",
            () => loadMissingEpisodeNumbers(db, animeRow.id),
          );
          const shouldDeferBatchCoverage = effectiveIsBatch &&
            parsedRelease.episodeNumbers.length === 0;
          const inferredCoveredEpisodes = shouldDeferBatchCoverage
            ? []
            : inferCoveredEpisodeNumbers({
              explicitEpisodes: parsedRelease.episodeNumbers,
              isBatch: effectiveIsBatch,
              totalEpisodes: animeRow.episodeCount,
              missingEpisodes,
              requestedEpisode,
            });
          const coveredEpisodes = toCoveredEpisodesJson(
            inferredCoveredEpisodes,
          );
          const sourceMetadata = mergeDownloadSourceMetadata(
            buildDownloadSourceMetadataFromRelease({
              chosenFromSeadex: input.release_metadata?.chosen_from_seadex ??
                input.release_metadata?.is_seadex,
              decisionReason: input.decision_reason,
              group: input.group,
              indexer: "Nyaa",
              previousQuality: input.release_metadata?.previous_quality,
              previousScore: input.release_metadata?.previous_score,
              selectionKind: input.release_metadata?.selection_kind ?? "manual",
              selectionScore: input.release_metadata?.selection_score,
              sourceUrl: input.release_metadata?.source_url,
              title: input.title,
            }),
            input.release_metadata,
          );
          const infoHash =
            (input.info_hash ?? parseMagnetInfoHash(input.magnet))
              ?.toLowerCase() ?? null;

          if (infoHash) {
            const coveredNumbers = inferredCoveredEpisodes;
            const overlapping = yield* tryDatabasePromise(
              "Failed to trigger download",
              () =>
                hasOverlappingDownload(
                  db,
                  animeRow.id,
                  infoHash,
                  coveredNumbers,
                ),
            );

            if (overlapping) {
              return yield* new DownloadConflictError({
                message: "An in-flight download already covers these episodes",
              });
            }
          }

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
                episodeNumber: requestedEpisode,
                isBatch: effectiveIsBatch,
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
                sourceMetadata: encodeDownloadSourceMetadata(sourceMetadata),
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
                downloadId: insertedId,
                eventType: "download.queued",
                metadataJson: {
                  covered_episodes: inferredCoveredEpisodes,
                  source_metadata: sourceMetadata,
                },
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
                shouldDeferBatchCoverage
                  ? `Queued batch download for ${animeRow.titleRomaji}; waiting for qBittorrent metadata to determine covered episodes`
                  : `Queued download for ${animeRow.titleRomaji} episode ${requestedEpisode}`,
              ),
          );
          yield* eventBus.publish({
            type: "DownloadStarted",
            payload: {
              anime_id: animeRow.id,
              source_metadata: sourceMetadata,
              title: input.title,
            },
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

function resolveRequestedEpisodeNumber(input: {
  explicitEpisode?: number;
  inferredEpisodes: readonly number[];
  isBatch: boolean;
}) {
  if (input.explicitEpisode && input.explicitEpisode > 0) {
    return input.explicitEpisode;
  }

  const inferredEpisode = input.inferredEpisodes[0];
  if (inferredEpisode && inferredEpisode > 0) {
    return inferredEpisode;
  }

  if (input.isBatch) {
    return 1;
  }

  return undefined;
}

export function mapQBitState(state: string): string {
  const value = state.toLowerCase();

  if (value.includes("error") || value.includes("missing")) {
    return "error";
  }

  if (
    value.includes("uploading") || value.includes("pausedup") ||
    value.includes("queuedup") || value.includes("stalledup") ||
    value.includes("checkingup") || value.includes("forcedup") ||
    value.includes("completed")
  ) {
    return "completed";
  }

  if (value.includes("pauseddl")) {
    return "paused";
  }

  if (value.includes("queueddl")) {
    return "queued";
  }

  if (
    value.includes("downloading") || value.includes("forceddl") ||
    value.includes("metadl") || value.includes("stalleddl") ||
    value.includes("checkingdl") || value.includes("allocating") ||
    value.includes("checkingresumedata") || value.includes("moving")
  ) {
    return "downloading";
  }

  if (value.includes("queued")) {
    return "queued";
  }

  if (value.includes("paused")) {
    return "paused";
  }

  return "queued";
}
