import { eq, inArray, sql } from "drizzle-orm";
import { Effect } from "effect";

import type { Config, DownloadSourceMetadata } from "../../../../../packages/shared/src/index.ts";
import type { AppDatabase } from "../../db/database.ts";
import { DatabaseError } from "../../db/database.ts";
import { downloads } from "../../db/schema.ts";
import { decodeDownloadSourceMetadata, loadRuntimeConfig } from "./repository.ts";
import { shouldReconcileCompletedDownloads } from "./download-support.ts";
import {
  inferCoveredEpisodesFromTorrentContents,
  parseCoveredEpisodesEffect,
  toCoveredEpisodesJson,
} from "./download-lifecycle.ts";
import { recordDownloadEvent } from "./job-support.ts";
import {
  DownloadConflictError,
  DownloadNotFoundError,
  ExternalCallError,
  type OperationsError,
} from "./errors.ts";
import type { TryDatabasePromise } from "./service-support.ts";
import type { QBitConfig, QBitTorrentClient } from "./qbittorrent.ts";
import { mapQBitState } from "./download-orchestration-shared.ts";

export function makeDownloadTorrentLifecycleService(input: {
  readonly db: AppDatabase;
  readonly qbitClient: typeof QBitTorrentClient.Service;
  readonly tryDatabasePromise: TryDatabasePromise;
  readonly wrapOperationsError: (
    message: string,
  ) => (cause: unknown) => ExternalCallError | OperationsError | DatabaseError;
  readonly maybeQBitConfig: (config: Config) => QBitConfig | null;
  readonly nowIso: () => Effect.Effect<string>;
  readonly reconcileCompletedTorrentEffect: (
    infoHash: string,
    contentPath: string | undefined,
  ) => Effect.Effect<void, ExternalCallError | OperationsError | DatabaseError>;
}) {
  const {
    db,
    qbitClient,
    tryDatabasePromise,
    wrapOperationsError,
    maybeQBitConfig,
    reconcileCompletedTorrentEffect,
  } = input;
  const { nowIso } = input;

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

    const contentsResult = yield* qbitClient
      .listTorrentContents(input.qbitConfig, input.infoHash)
      .pipe(Effect.either);

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

    const currentEpisodes = yield* parseCoveredEpisodesEffect(input.existingCoveredEpisodes);
    if (
      currentEpisodes.length === inferredEpisodes.length &&
      currentEpisodes.every((episode, index) => episode === inferredEpisodes[index])
    ) {
      return;
    }

    yield* tryDatabasePromise("Failed to sync downloads with qBittorrent", () =>
      db
        .update(downloads)
        .set({
          coveredEpisodes: toCoveredEpisodesJson(inferredEpisodes),
          episodeNumber: inferredEpisodes[0] ?? 1,
          isBatch: inferredEpisodes.length > 1,
        })
        .where(eq(downloads.id, input.downloadId)),
    );

    yield* recordDownloadEvent(
      db,
      {
        animeId: input.animeId,
        downloadId: input.downloadId,
        eventType: "download.coverage_refined",
        metadataJson: {
          covered_episodes: inferredEpisodes,
          source_metadata: input.sourceMetadata,
        },
        message: `Refined batch episodes from qBittorrent file list: ${inferredEpisodes.join(", ")}`,
        metadata: toCoveredEpisodesJson(inferredEpisodes),
      },
      nowIso,
    );
  });

  const syncDownloadsWithQBitEffect = Effect.fn("OperationsService.syncDownloadsWithQBit")(
    function* () {
      const config = yield* loadRuntimeConfig(db);
      const qbitConfig = maybeQBitConfig(config);

      if (!qbitConfig) {
        return;
      }

      const torrentsResult = yield* qbitClient.listTorrents(qbitConfig).pipe(Effect.either);

      if (torrentsResult._tag === "Left") {
        yield* Effect.logWarning("qBittorrent unreachable, skipping download sync").pipe(
          Effect.annotateLogs({ error: String(torrentsResult.left) }),
        );
        return;
      }

      const torrents = torrentsResult.right;

      if (torrents.length === 0) {
        return;
      }

      const infoHashes = torrents.map((t) => t.hash.toLowerCase());
      const allExistingDownloads = yield* tryDatabasePromise(
        "Failed to sync downloads with qBittorrent",
        () => db.select().from(downloads).where(inArray(downloads.infoHash, infoHashes)),
      );

      const existingDownloadsMap = new Map(
        allExistingDownloads.map((d) => [d.infoHash?.toLowerCase(), d]),
      );

      for (const torrent of torrents) {
        const syncNow = yield* nowIso();
        const status = mapQBitState(torrent.state);
        const hash = torrent.hash.toLowerCase();
        const existing = existingDownloadsMap.get(hash);
        const preservedImported = Boolean(existing?.reconciledAt);
        const nextStatus = preservedImported ? "imported" : status;
        const nextExternalState = preservedImported
          ? (existing?.externalState ?? "imported")
          : torrent.state;
        let nextDownloadDate: string | null;
        if (preservedImported) {
          nextDownloadDate = existing?.downloadDate ?? syncNow;
        } else {
          nextDownloadDate = status === "completed" ? syncNow : null;
        }

        let errorMessage: string | null = null;
        if (!preservedImported && status === "error") {
          errorMessage = `qBittorrent state: ${torrent.state}`;
        }

        yield* tryDatabasePromise("Failed to sync downloads with qBittorrent", () =>
          db
            .update(downloads)
            .set({
              contentPath: torrent.content_path ?? null,
              downloadDate: nextDownloadDate,
              downloadedBytes: torrent.downloaded,
              errorMessage,
              etaSeconds: torrent.eta,
              externalState: nextExternalState,
              lastErrorAt: preservedImported || status !== "error" ? null : syncNow,
              lastSyncedAt: syncNow,
              progress: Math.round(torrent.progress * 100),
              savePath: torrent.save_path ?? null,
              speedBytes: torrent.dlspeed,
              status: nextStatus,
              totalBytes: torrent.size,
            })
            .where(eq(downloads.infoHash, torrent.hash.toLowerCase())),
        );

        if (existing && existing.isBatch && !preservedImported) {
          yield* refineBatchCoverageFromTorrentFiles({
            animeId: existing.animeId,
            downloadId: existing.id,
            existingCoveredEpisodes: existing.coveredEpisodes,
            infoHash: torrent.hash.toLowerCase(),
            qbitConfig,
            sourceMetadata: yield* decodeDownloadSourceMetadata(existing.sourceMetadata),
            torrentName: torrent.name,
          });
        }

        if (existing && existing.status !== nextStatus) {
          const coveredEpisodes = yield* parseCoveredEpisodesEffect(existing.coveredEpisodes);
          yield* recordDownloadEvent(
            db,
            {
              animeId: existing.animeId,
              downloadId: existing.id,
              eventType: "download.status_changed",
              fromStatus: existing.status,
              metadataJson: {
                covered_episodes: coveredEpisodes,
                source_metadata: yield* decodeDownloadSourceMetadata(existing.sourceMetadata),
              },
              message: `${existing.torrentName} moved to ${nextStatus}`,
              toStatus: nextStatus,
            },
            nowIso,
          );
        }

        if (status === "completed" && shouldReconcileCompletedDownloads(config)) {
          yield* reconcileCompletedTorrentEffect(
            torrent.hash.toLowerCase(),
            torrent.content_path ?? torrent.save_path,
          );
        }
      }
    },
  );

  const applyDownloadActionEffect = Effect.fn("OperationsService.applyDownloadAction")(function* (
    id: number,
    action: "pause" | "resume" | "delete",
    deleteFiles = false,
  ) {
    const rows = yield* tryDatabasePromise(`Failed to ${action} download`, () =>
      db.select().from(downloads).where(eq(downloads.id, id)).limit(1),
    );
    const [row] = rows;

    if (!row) {
      return yield* new DownloadNotFoundError({
        message: "Download not found",
      });
    }

    const runtimeConfig = yield* loadRuntimeConfig(db);
    const qbitConfig = maybeQBitConfig(runtimeConfig);

    if (qbitConfig && row.infoHash) {
      if (action === "pause") {
        yield* qbitClient
          .pauseTorrent(qbitConfig, row.infoHash)
          .pipe(Effect.mapError(wrapOperationsError("Failed to pause download")));
      } else if (action === "resume") {
        yield* qbitClient
          .resumeTorrent(qbitConfig, row.infoHash)
          .pipe(Effect.mapError(wrapOperationsError("Failed to resume download")));
      } else {
        yield* qbitClient
          .deleteTorrent(qbitConfig, row.infoHash, deleteFiles)
          .pipe(Effect.mapError(wrapOperationsError("Failed to remove download")));
      }
    }

    const coveredEpisodes = yield* parseCoveredEpisodesEffect(row.coveredEpisodes);

    if (action === "delete") {
      yield* recordDownloadEvent(
        db,
        {
          animeId: row.animeId,
          downloadId: row.id,
          eventType: "download.deleted",
          fromStatus: row.status,
          metadataJson: {
            covered_episodes: coveredEpisodes,
            source_metadata: yield* decodeDownloadSourceMetadata(row.sourceMetadata),
          },
          message: `Deleted ${row.torrentName}`,
          toStatus: "deleted",
        },
        nowIso,
      );
      yield* tryDatabasePromise("Failed to remove download", () =>
        db.delete(downloads).where(eq(downloads.id, id)),
      );
      return;
    }

    yield* tryDatabasePromise(`Failed to ${action} download`, () =>
      db
        .update(downloads)
        .set({
          externalState: action,
          status: action === "pause" ? "paused" : "downloading",
        })
        .where(eq(downloads.id, id)),
    );

    yield* recordDownloadEvent(
      db,
      {
        animeId: row.animeId,
        downloadId: row.id,
        eventType: `download.${action}d`,
        fromStatus: row.status,
        metadataJson: {
          covered_episodes: coveredEpisodes,
          source_metadata: yield* decodeDownloadSourceMetadata(row.sourceMetadata),
        },
        message: `${action === "pause" ? "Paused" : "Resumed"} ${row.torrentName}`,
        toStatus: action === "pause" ? "paused" : "downloading",
      },
      nowIso,
    );
  });

  const retryDownloadById = Effect.fn("OperationsService.retryDownloadById")(function* (
    id: number,
  ) {
    const rows = yield* tryDatabasePromise("Failed to retry download", () =>
      db.select().from(downloads).where(eq(downloads.id, id)).limit(1),
    );
    const [row] = rows;

    if (!row) {
      return yield* new DownloadNotFoundError({
        message: "Download not found",
      });
    }

    if (!row.magnet) {
      return yield* new DownloadConflictError({
        message: "Download cannot be retried without a magnet link",
      });
    }

    const runtimeConfig = yield* loadRuntimeConfig(db);
    const qbitConfig = maybeQBitConfig(runtimeConfig);
    const coveredEpisodes = yield* parseCoveredEpisodesEffect(row.coveredEpisodes);

    if (qbitConfig) {
      yield* qbitClient
        .addTorrentUrl(qbitConfig, row.magnet)
        .pipe(Effect.mapError(wrapOperationsError("Failed to retry download")));
    }

    const retryNow = yield* nowIso();
    yield* tryDatabasePromise("Failed to retry download", () =>
      db
        .update(downloads)
        .set({
          errorMessage: null,
          externalState: qbitConfig ? "downloading" : "queued",
          lastErrorAt: null,
          lastSyncedAt: retryNow,
          progress: 0,
          retryCount: sql`${downloads.retryCount} + 1`,
          status: qbitConfig ? "downloading" : "queued",
        })
        .where(eq(downloads.id, id)),
    );

    yield* recordDownloadEvent(
      db,
      {
        animeId: row.animeId,
        downloadId: row.id,
        eventType: "download.retried",
        fromStatus: row.status,
        metadataJson: {
          covered_episodes: coveredEpisodes,
          source_metadata: yield* decodeDownloadSourceMetadata(row.sourceMetadata),
        },
        message: `Retried ${row.torrentName}`,
        toStatus: qbitConfig ? "downloading" : "queued",
      },
      nowIso,
    );
  });

  return {
    applyDownloadActionEffect,
    retryDownloadById,
    syncDownloadsWithQBitEffect,
  };
}
