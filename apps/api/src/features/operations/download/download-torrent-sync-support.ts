import { Effect } from "effect";

import type { Config, DownloadSourceMetadata } from "@packages/shared/index.ts";
import type { DatabaseError } from "@/db/database.ts";
import type { downloads } from "@/db/schema.ts";
import {
  inferCoveredEpisodesFromTorrentContents,
  parseCoveredEpisodesEffect,
  toCoveredEpisodesJson,
} from "@/features/operations/download/download-coverage.ts";
import {
  decodeDownloadSourceMetadata,
  type DownloadEventRecordInput,
} from "@/features/operations/repository/download-repository.ts";
import { DownloadSyncRepository } from "@/features/operations/repository/download-sync-repository.ts";
import type { TorrentSyncUpdate } from "@/features/operations/repository/download-sync-repository.ts";
import type { OperationsError } from "@/features/operations/errors.ts";
import type { ExternalCallError } from "@/infra/effect/retry.ts";
import { mapQBitState } from "@/features/operations/qbittorrent/qbittorrent.ts";
import {
  RuntimeConfigSnapshotService,
  type RuntimeConfigSnapshotError,
} from "@/features/system/runtime-config-snapshot-service.ts";
import { TorrentClientService } from "@/features/operations/qbittorrent/torrent-client-service.ts";
import { nowIso as currentNowIso } from "@/infra/time.ts";
import { DownloadReconciliationService } from "@/features/operations/download/download-reconciliation-service.ts";

function shouldReconcileCompletedDownloads(config: Config | null) {
  return config?.downloads.reconcile_completed_downloads ?? true;
}

const TORRENT_SYNC_UPDATE_CHUNK_SIZE = 50;

export interface DownloadTorrentSyncSupportInput {
  readonly syncRepo: typeof DownloadSyncRepository.Service;
  readonly torrentClientService: typeof TorrentClientService.Service;
  readonly nowIso: () => Effect.Effect<string>;
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
  const { syncRepo, reconcileCompletedTorrentEffect, torrentClientService, nowIso } = input;

  const refineBatchCoverageFromTorrentFiles = Effect.fn(
    "OperationsService.refineBatchCoverageFromTorrentFiles",
  )(function* (refineInput: {
    mediaId: number;
    downloadId: number;
    existingCoveredEpisodes: string | null;
    infoHash: string;
    sourceMetadata?: DownloadSourceMetadata;
    torrentName: string;
  }) {
    const contentsResult = yield* torrentClientService
      .listTorrentContentsIfEnabled(refineInput.infoHash)
      .pipe(Effect.either);

    if (contentsResult._tag === "Left") {
      yield* Effect.logDebug("Failed to inspect qBittorrent file list").pipe(
        Effect.annotateLogs({
          downloadId: refineInput.downloadId,
          error: String(contentsResult.left),
          infoHash: refineInput.infoHash,
        }),
      );
      return;
    }

    if (contentsResult.right._tag === "Disabled") {
      return;
    }

    const mediaRow = yield* syncRepo.lookupMediaKind(refineInput.mediaId);
    const inferredEpisodes = inferCoveredEpisodesFromTorrentContents({
      files: contentsResult.right.files,
      parseVolumeNumbers: mediaRow?.mediaKind !== "anime",
      rootName: refineInput.torrentName,
    });

    if (inferredEpisodes.length === 0) {
      return;
    }

    const currentEpisodes = yield* parseCoveredEpisodesEffect(refineInput.existingCoveredEpisodes);
    if (
      currentEpisodes.length === inferredEpisodes.length &&
      currentEpisodes.every((episode, index) => episode === inferredEpisodes[index])
    ) {
      return;
    }

    const encodedInferredEpisodes = yield* toCoveredEpisodesJson(inferredEpisodes);

    yield* syncRepo.updateDownloadCoveredUnits({
      coveredUnits: encodedInferredEpisodes,
      downloadId: refineInput.downloadId,
      isBatch: inferredEpisodes.length > 1,
      unitNumber: inferredEpisodes[0] ?? 1,
    });

    const coverageNow = yield* nowIso();
    yield* syncRepo.insertDownloadEvent(
      {
        mediaId: refineInput.mediaId,
        downloadId: refineInput.downloadId,
        eventType: "download.coverage_refined",
        metadataJson: {
          covered_units: inferredEpisodes,
          ...(refineInput.sourceMetadata ? { source_metadata: refineInput.sourceMetadata } : {}),
        },
        message: `Refined batch mediaUnits from qBittorrent file list: ${inferredEpisodes.join(", ")}`,
        metadata: encodedInferredEpisodes,
      },
      coverageNow,
    );
  });

  const updateDownloadsFromTorrentRows = Effect.fn(
    "OperationsService.updateDownloadsFromTorrentRows",
  )(function* (rows: readonly TorrentSyncUpdate[]) {
    if (rows.length === 0) {
      return;
    }

    for (let index = 0; index < rows.length; index += TORRENT_SYNC_UPDATE_CHUNK_SIZE) {
      const chunk = rows.slice(index, index + TORRENT_SYNC_UPDATE_CHUNK_SIZE);
      yield* syncRepo.bulkUpdateTorrentSyncRows(chunk);
    }
  });

  const buildStatusChangeEvents = Effect.fn("OperationsService.buildStatusChangeEvents")(function* (
    rows: readonly TorrentSyncUpdate[],
    existingDownloadsMap: ReadonlyMap<string | undefined, typeof downloads.$inferSelect>,
  ) {
    const maybeEvents: Array<DownloadEventRecordInput | null> = yield* Effect.forEach(rows, (row) =>
      Effect.gen(function* () {
        const existing = existingDownloadsMap.get(row.hash);
        if (!existing || existing.status === row.nextStatus) {
          return null as DownloadEventRecordInput | null;
        }

        const coveredUnits = yield* parseCoveredEpisodesEffect(existing.coveredUnits);
        const sourceMetadata = yield* decodeDownloadSourceMetadata(existing.sourceMetadata);

        return {
          mediaId: existing.mediaId,
          downloadId: existing.id,
          eventType: "download.status_changed",
          fromStatus: existing.status,
          metadataJson: {
            covered_units: coveredUnits,
            ...(sourceMetadata ? { source_metadata: sourceMetadata } : {}),
          },
          message: `${existing.torrentName} moved to ${row.nextStatus}`,
          toStatus: row.nextStatus,
        } satisfies DownloadEventRecordInput as DownloadEventRecordInput | null;
      }),
    );

    return maybeEvents.filter((event): event is DownloadEventRecordInput => event !== null);
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
      const allExistingDownloads = yield* syncRepo.listDownloadsByInfoHashes(infoHashes);

      const existingDownloadsMap = new Map(
        allExistingDownloads.map((d) => [d.infoHash?.toLowerCase(), d]),
      );

      const syncNow = yield* nowIso();
      const updateRows = torrents.map((torrent): TorrentSyncUpdate => {
        const status = mapQBitState(torrent.state);
        const hash = torrent.hash.toLowerCase();
        const existing = existingDownloadsMap.get(hash);
        const preservedImported = Boolean(existing?.reconciledAt);
        const nextStatus = preservedImported ? "imported" : status;
        const nextExternalState = preservedImported
          ? (existing?.externalState ?? "imported")
          : torrent.state;
        const nextDownloadDate = preservedImported
          ? (existing?.downloadDate ?? syncNow)
          : status === "completed"
            ? syncNow
            : null;

        return {
          contentPath: torrent.content_path ?? null,
          downloadedBytes: torrent.downloaded,
          downloadDate: nextDownloadDate,
          errorMessage:
            !preservedImported && status === "error" ? `qBittorrent state: ${torrent.state}` : null,
          etaSeconds: torrent.eta,
          externalState: nextExternalState,
          hash,
          lastErrorAt: preservedImported || status !== "error" ? null : syncNow,
          lastSyncedAt: syncNow,
          nextStatus,
          progress: Math.round(torrent.progress * 100),
          savePath: torrent.save_path ?? null,
          status,
          torrentName: torrent.name,
          totalBytes: torrent.size,
          speedBytes: torrent.dlspeed,
        };
      });

      yield* updateDownloadsFromTorrentRows(updateRows);

      const statusEvents = yield* buildStatusChangeEvents(updateRows, existingDownloadsMap);
      yield* syncRepo.insertDownloadEvents(statusEvents, syncNow);

      for (const updateRow of updateRows) {
        const existing = existingDownloadsMap.get(updateRow.hash);
        const preservedImported = Boolean(existing?.reconciledAt);

        if (existing && existing.isBatch && !preservedImported) {
          const sourceMetadata = yield* decodeDownloadSourceMetadata(existing.sourceMetadata);
          yield* refineBatchCoverageFromTorrentFiles({
            mediaId: existing.mediaId,
            downloadId: existing.id,
            existingCoveredEpisodes: existing.coveredUnits,
            infoHash: updateRow.hash,
            torrentName: updateRow.torrentName,
            ...(sourceMetadata ? { sourceMetadata } : {}),
          });
        }

        if (updateRow.status === "completed" && shouldReconcileCompletedDownloads(runtimeConfig)) {
          yield* reconcileCompletedTorrentEffect(
            updateRow.hash,
            updateRow.contentPath ?? updateRow.savePath ?? undefined,
          );
        }
      }
    },
  );

  return {
    syncDownloadsWithQBitEffect,
  };
}

export class DownloadTorrentSyncService extends Effect.Service<DownloadTorrentSyncService>()(
  "@bakarr/api/DownloadTorrentSyncService",
  {
    effect: Effect.gen(function* () {
      const syncRepo = yield* DownloadSyncRepository;
      const torrentClientService = yield* TorrentClientService;
      const reconciliationService = yield* DownloadReconciliationService;
      const runtimeConfigSnapshot = yield* RuntimeConfigSnapshotService;

      return makeDownloadTorrentSyncSupport({
        syncRepo,
        getRuntimeConfig: runtimeConfigSnapshot.getRuntimeConfig,
        nowIso: currentNowIso,
        torrentClientService,
        reconcileCompletedTorrentEffect: reconciliationService.reconcileCompletedTorrentEffect,
      });
    }),
  },
) {}

export const DownloadTorrentSyncServiceLive = DownloadTorrentSyncService.Default;
