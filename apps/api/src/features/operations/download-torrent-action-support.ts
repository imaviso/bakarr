import { eq, sql } from "drizzle-orm";
import { Effect } from "effect";

import type { Config } from "@packages/shared/index.ts";
import type { AppDatabase } from "@/db/database.ts";
import { DatabaseError } from "@/db/database.ts";
import { downloads } from "@/db/schema.ts";
import {
  DownloadConflictError,
  DownloadNotFoundError,
  OperationsInfrastructureError,
} from "@/features/operations/errors.ts";
import { decodeDownloadSourceMetadata } from "@/features/operations/repository/download-repository.ts";
import { parseCoveredEpisodesEffect } from "@/features/operations/download-coverage.ts";
import { recordDownloadEvent } from "@/features/operations/job-support.ts";
import type { TryDatabasePromise } from "@/lib/effect-db.ts";
import type { QBitConfig, QBitTorrentClient } from "@/features/operations/qbittorrent.ts";
import type { RuntimeConfigSnapshotError } from "@/features/system/runtime-config-snapshot-service.ts";

export interface DownloadTorrentActionSupportInput {
  readonly db: AppDatabase;
  readonly qbitClient: typeof QBitTorrentClient.Service;
  readonly tryDatabasePromise: TryDatabasePromise;
  readonly maybeQBitConfig: (config: Config) => QBitConfig | null;
  readonly nowIso: () => Effect.Effect<string>;
  readonly getRuntimeConfig: () => Effect.Effect<Config, RuntimeConfigSnapshotError>;
}

export function makeDownloadTorrentActionSupport(input: DownloadTorrentActionSupportInput) {
  const { db, qbitClient, tryDatabasePromise, maybeQBitConfig, getRuntimeConfig } = input;
  const { nowIso } = input;

  const mapQBitError = (message: string) => (cause: unknown) =>
    cause instanceof DatabaseError
      ? cause
      : new OperationsInfrastructureError({
          message,
          cause,
        });

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

    const runtimeConfig = yield* getRuntimeConfig();
    const qbitConfig = maybeQBitConfig(runtimeConfig);

    if (qbitConfig && row.infoHash) {
      if (action === "pause") {
        yield* qbitClient
          .pauseTorrent(qbitConfig, row.infoHash)
          .pipe(Effect.mapError(mapQBitError("Failed to pause download")));
      } else if (action === "resume") {
        yield* qbitClient
          .resumeTorrent(qbitConfig, row.infoHash)
          .pipe(Effect.mapError(mapQBitError("Failed to resume download")));
      } else {
        yield* qbitClient
          .deleteTorrent(qbitConfig, row.infoHash, deleteFiles)
          .pipe(Effect.mapError(mapQBitError("Failed to remove download")));
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

    const runtimeConfig = yield* getRuntimeConfig();
    const qbitConfig = maybeQBitConfig(runtimeConfig);
    const coveredEpisodes = yield* parseCoveredEpisodesEffect(row.coveredEpisodes);

    if (qbitConfig) {
      yield* qbitClient
        .addTorrentUrl(qbitConfig, row.magnet)
        .pipe(Effect.mapError(mapQBitError("Failed to retry download")));
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
  };
}

export type DownloadTorrentActionSupportShape = ReturnType<typeof makeDownloadTorrentActionSupport>;
