import { eq, inArray, sql, type SQL } from "drizzle-orm";
import { Context, Effect, Layer } from "effect";

import type { Config, DownloadSourceMetadata } from "@packages/shared/index.ts";
import { Database, type DatabaseError } from "@/db/database.ts";
import { downloads, media } from "@/db/schema.ts";
import {
  inferCoveredEpisodesFromTorrentContents,
  parseCoveredEpisodesEffect,
  toCoveredEpisodesJson,
} from "@/features/operations/download/download-coverage.ts";
import { decodeDownloadSourceMetadata } from "@/features/operations/repository/download-repository.ts";
import {
  recordDownloadEvent,
  recordDownloadEvents,
  type DownloadEventRecordInput,
} from "@/features/operations/shared/job-support.ts";
import type { OperationsError } from "@/features/operations/errors.ts";
import type { ExternalCallError } from "@/infra/effect/retry.ts";
import { mapQBitState } from "@/features/operations/qbittorrent/qbittorrent.ts";
import type { DownloadTorrentActionSupportInput } from "@/features/operations/download/download-torrent-action-support.ts";
import {
  RuntimeConfigSnapshotService,
  type RuntimeConfigSnapshotError,
} from "@/features/system/runtime-config-snapshot-service.ts";
import { TorrentClientService } from "@/features/operations/qbittorrent/torrent-client-service.ts";
import { ClockService, nowIsoFromClock } from "@/infra/clock.ts";
import { tryDatabasePromise } from "@/infra/effect/db.ts";
import { DownloadReconciliationService } from "@/features/operations/download/download-reconciliation-service.ts";

function shouldReconcileCompletedDownloads(config: Config | null) {
  return config?.downloads.reconcile_completed_downloads ?? true;
}

const TORRENT_SYNC_UPDATE_CHUNK_SIZE = 50;

type TorrentSyncSqlValue = number | string | null;

interface TorrentSyncUpdate {
  readonly contentPath: string | null;
  readonly downloadedBytes: number;
  readonly downloadDate: string | null;
  readonly errorMessage: string | null;
  readonly etaSeconds: number;
  readonly externalState: string;
  readonly hash: string;
  readonly lastErrorAt: string | null;
  readonly lastSyncedAt: string;
  readonly nextStatus: string;
  readonly progress: number;
  readonly savePath: string | null;
  readonly speedBytes: number;
  readonly status: string;
  readonly torrentName: string;
  readonly totalBytes: number;
}

function buildTorrentSyncCase(
  rows: readonly TorrentSyncUpdate[],
  selectValue: (row: TorrentSyncUpdate) => TorrentSyncSqlValue,
  fallback: SQL,
): SQL {
  return sql`case ${downloads.infoHash} ${sql.join(
    rows.map((row) => sql`when ${row.hash} then ${selectValue(row)}`),
    sql` `,
  )} else ${fallback} end`;
}

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

export class DownloadTorrentSyncService extends Context.Tag(
  "@bakarr/api/DownloadTorrentSyncService",
)<DownloadTorrentSyncService, DownloadTorrentSyncSupportShape>() {}

export const DownloadTorrentSyncServiceLive = Layer.effect(
  DownloadTorrentSyncService,
  Effect.gen(function* () {
    const { db } = yield* Database;
    const torrentClientService = yield* TorrentClientService;
    const clock = yield* ClockService;
    const reconciliationService = yield* DownloadReconciliationService;
    const runtimeConfigSnapshot = yield* RuntimeConfigSnapshotService;

    return DownloadTorrentSyncService.of(
      makeDownloadTorrentSyncSupport({
        db,
        getRuntimeConfig: runtimeConfigSnapshot.getRuntimeConfig,
        nowIso: () => nowIsoFromClock(clock),
        torrentClientService,
        reconcileCompletedTorrentEffect: reconciliationService.reconcileCompletedTorrentEffect,
        tryDatabasePromise,
      }),
    );
  }),
);

export function makeDownloadTorrentSyncSupport(input: DownloadTorrentSyncSupportInput) {
  const { db, tryDatabasePromise, reconcileCompletedTorrentEffect, torrentClientService } = input;
  const { nowIso } = input;

  const refineBatchCoverageFromTorrentFiles = Effect.fn(
    "OperationsService.refineBatchCoverageFromTorrentFiles",
  )(function* (input: {
    mediaId: number;
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

    const mediaRows = yield* tryDatabasePromise("Failed to sync downloads with qBittorrent", () =>
      db
        .select({ mediaKind: media.mediaKind })
        .from(media)
        .where(eq(media.id, input.mediaId))
        .limit(1),
    );
    const inferredEpisodes = inferCoveredEpisodesFromTorrentContents({
      files: contentsResult.right.files,
      parseVolumeNumbers: mediaRows[0]?.mediaKind !== "anime",
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
          coveredUnits: encodedInferredEpisodes,
          unitNumber: inferredEpisodes[0] ?? 1,
          isBatch: inferredEpisodes.length > 1,
        })
        .where(eq(downloads.id, input.downloadId)),
    );

    yield* recordDownloadEvent(
      db,
      {
        mediaId: input.mediaId,
        downloadId: input.downloadId,
        eventType: "download.coverage_refined",
        metadataJson: {
          covered_units: inferredEpisodes,
          ...(input.sourceMetadata ? { source_metadata: input.sourceMetadata } : {}),
        },
        message: `Refined batch mediaUnits from qBittorrent file list: ${inferredEpisodes.join(", ")}`,
        metadata: encodedInferredEpisodes,
      },
      nowIso,
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

      yield* tryDatabasePromise("Failed to sync downloads with qBittorrent", () =>
        db
          .update(downloads)
          .set({
            contentPath: buildTorrentSyncCase(
              chunk,
              (row) => row.contentPath,
              sql`${downloads.contentPath}`,
            ),
            downloadDate: buildTorrentSyncCase(
              chunk,
              (row) => row.downloadDate,
              sql`${downloads.downloadDate}`,
            ),
            downloadedBytes: buildTorrentSyncCase(
              chunk,
              (row) => row.downloadedBytes,
              sql`${downloads.downloadedBytes}`,
            ),
            errorMessage: buildTorrentSyncCase(
              chunk,
              (row) => row.errorMessage,
              sql`${downloads.errorMessage}`,
            ),
            etaSeconds: buildTorrentSyncCase(
              chunk,
              (row) => row.etaSeconds,
              sql`${downloads.etaSeconds}`,
            ),
            externalState: buildTorrentSyncCase(
              chunk,
              (row) => row.externalState,
              sql`${downloads.externalState}`,
            ),
            lastErrorAt: buildTorrentSyncCase(
              chunk,
              (row) => row.lastErrorAt,
              sql`${downloads.lastErrorAt}`,
            ),
            lastSyncedAt: buildTorrentSyncCase(
              chunk,
              (row) => row.lastSyncedAt,
              sql`${downloads.lastSyncedAt}`,
            ),
            progress: buildTorrentSyncCase(
              chunk,
              (row) => row.progress,
              sql`${downloads.progress}`,
            ),
            savePath: buildTorrentSyncCase(
              chunk,
              (row) => row.savePath,
              sql`${downloads.savePath}`,
            ),
            speedBytes: buildTorrentSyncCase(
              chunk,
              (row) => row.speedBytes,
              sql`${downloads.speedBytes}`,
            ),
            status: buildTorrentSyncCase(chunk, (row) => row.nextStatus, sql`${downloads.status}`),
            totalBytes: buildTorrentSyncCase(
              chunk,
              (row) => row.totalBytes,
              sql`${downloads.totalBytes}`,
            ),
          })
          .where(
            inArray(
              downloads.infoHash,
              chunk.map((row) => row.hash),
            ),
          ),
      );
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
      const allExistingDownloads = yield* tryDatabasePromise(
        "Failed to sync downloads with qBittorrent",
        () => db.select().from(downloads).where(inArray(downloads.infoHash, infoHashes)),
      );

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
      yield* recordDownloadEvents(db, statusEvents, nowIso);

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
