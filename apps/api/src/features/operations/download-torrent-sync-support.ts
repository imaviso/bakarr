import { eq, inArray } from "drizzle-orm";
import { Effect } from "effect";

import type { Config, DownloadSourceMetadata } from "@packages/shared/index.ts";
import type { DatabaseError } from "@/db/database.ts";
import { downloads } from "@/db/schema.ts";
import { shouldReconcileCompletedDownloads } from "@/features/operations/download-support.ts";
import {
  inferCoveredEpisodesFromTorrentContents,
  parseCoveredEpisodesEffect,
  toCoveredEpisodesJson,
} from "@/features/operations/download-coverage.ts";
import { decodeDownloadSourceMetadata } from "@/features/operations/repository/download-repository.ts";
import { recordDownloadEvent } from "@/features/operations/job-support.ts";
import type { OperationsError } from "@/features/operations/errors.ts";
import type { ExternalCallError } from "@/infra/effect/retry.ts";
import { mapQBitState } from "@/features/operations/download-orchestration-shared.ts";
import type { DownloadTorrentActionSupportInput } from "@/features/operations/download-torrent-action-support.ts";
import { type RuntimeConfigSnapshotError } from "@/features/system/runtime-config-snapshot-service.ts";

export interface DownloadTorrentSyncSupportInput extends DownloadTorrentActionSupportInput {
  readonly getRuntimeConfig: () => Effect.Effect<Config, RuntimeConfigSnapshotError>;
  readonly reconcileCompletedTorrentEffect: (
    infoHash: string,
    contentPath: string | undefined,
  ) => Effect.Effect<
    void,
    ExternalCallError | OperationsError | DatabaseError | RuntimeConfigSnapshotError
  >;
}

export interface DownloadTorrentSyncSupportShape {
  readonly syncDownloadsWithQBitEffect: () => Effect.Effect<
    void,
    OperationsError | RuntimeConfigSnapshotError
  >;
}

export function makeDownloadTorrentSyncSupport(input: DownloadTorrentSyncSupportInput) {
  const { db, tryDatabasePromise, reconcileCompletedTorrentEffect, torrentClientService } = input;
  const { nowIso } = input;

  const refineBatchCoverageFromTorrentFiles = Effect.fn(
    "OperationsService.refineBatchCoverageFromTorrentFiles",
  )(function* (input: {
    animeId: number;
    downloadId: number;
    existingCoveredEpisodes: string | null;
    infoHash: string;
    sourceMetadata?: DownloadSourceMetadata;
    torrentName: string;
  }) {
    const contentsResult = yield* torrentClientService
      .listTorrentContentsIfEnabled(input.infoHash)
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

    if (contentsResult.right._tag === "Disabled") {
      return;
    }

    const inferredEpisodes = inferCoveredEpisodesFromTorrentContents({
      files: contentsResult.right.files,
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

    const encodedInferredEpisodes = yield* toCoveredEpisodesJson(inferredEpisodes);

    yield* tryDatabasePromise("Failed to sync downloads with qBittorrent", () =>
      db
        .update(downloads)
        .set({
          coveredEpisodes: encodedInferredEpisodes,
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
          ...(input.sourceMetadata ? { source_metadata: input.sourceMetadata } : {}),
        },
        message: `Refined batch episodes from qBittorrent file list: ${inferredEpisodes.join(", ")}`,
        metadata: encodedInferredEpisodes,
      },
      nowIso,
    );
  });

  const syncDownloadsWithQBitEffect = Effect.fn("OperationsService.syncDownloadsWithQBit")(
    function* () {
      const runtimeConfig = yield* input.getRuntimeConfig();
      const torrentsResult = yield* torrentClientService
        .listTorrentsIfEnabled()
        .pipe(Effect.either);

      if (torrentsResult._tag === "Left") {
        yield* Effect.logWarning("qBittorrent unreachable, skipping download sync").pipe(
          Effect.annotateLogs({ error: String(torrentsResult.left) }),
        );
        return;
      }

      if (torrentsResult.right._tag === "Disabled") {
        return;
      }

      const torrents = torrentsResult.right.torrents;

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
          const sourceMetadata = yield* decodeDownloadSourceMetadata(existing.sourceMetadata);
          yield* refineBatchCoverageFromTorrentFiles({
            animeId: existing.animeId,
            downloadId: existing.id,
            existingCoveredEpisodes: existing.coveredEpisodes,
            infoHash: torrent.hash.toLowerCase(),
            torrentName: torrent.name,
            ...(sourceMetadata ? { sourceMetadata } : {}),
          });
        }

        if (existing && existing.status !== nextStatus) {
          const coveredEpisodes = yield* parseCoveredEpisodesEffect(existing.coveredEpisodes);
          const statusSourceMetadata = yield* decodeDownloadSourceMetadata(existing.sourceMetadata);
          yield* recordDownloadEvent(
            db,
            {
              animeId: existing.animeId,
              downloadId: existing.id,
              eventType: "download.status_changed",
              fromStatus: existing.status,
              metadataJson: {
                covered_episodes: coveredEpisodes,
                ...(statusSourceMetadata ? { source_metadata: statusSourceMetadata } : {}),
              },
              message: `${existing.torrentName} moved to ${nextStatus}`,
              toStatus: nextStatus,
            },
            nowIso,
          );
        }

        if (status === "completed" && shouldReconcileCompletedDownloads(runtimeConfig)) {
          yield* reconcileCompletedTorrentEffect(
            torrent.hash.toLowerCase(),
            torrent.content_path ?? torrent.save_path,
          );
        }
      }
    },
  );

  return {
    syncDownloadsWithQBitEffect,
  };
}
