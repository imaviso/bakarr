import { eq, sql } from "drizzle-orm";
import { Effect } from "effect";

import type { AppDatabase } from "@/db/database.ts";
import { DatabaseError } from "@/db/database.ts";
import { downloads } from "@/db/schema.ts";
import {
  DownloadConflictError,
  DownloadNotFoundError,
  OperationsInfrastructureError,
  OperationsStoredDataError,
} from "@/features/operations/errors.ts";
import { decodeDownloadSourceMetadata } from "@/features/operations/repository/download-repository.ts";
import { parseCoveredEpisodesEffect } from "@/features/operations/download-coverage.ts";
import { recordDownloadEvent } from "@/features/operations/job-support.ts";
import type { TryDatabasePromise } from "@/lib/effect-db.ts";
import { TorrentClientService } from "@/features/operations/torrent-client-service.ts";
import type { RuntimeConfigSnapshotError } from "@/features/system/runtime-config-snapshot-service.ts";

export interface DownloadTorrentActionSupportInput {
  readonly db: AppDatabase;
  readonly torrentClientService: typeof TorrentClientService.Service;
  readonly tryDatabasePromise: TryDatabasePromise;
  readonly nowIso: () => Effect.Effect<string>;
  readonly getRuntimeConfig: () => Effect.Effect<
    import("@packages/shared/index.ts").Config,
    RuntimeConfigSnapshotError
  >;
}

export interface DownloadTorrentActionSupportShape {
  readonly applyDownloadActionEffect: (
    id: number,
    action: "pause" | "resume" | "delete",
    deleteFiles?: boolean,
  ) => Effect.Effect<
    void,
    | DatabaseError
    | DownloadNotFoundError
    | OperationsStoredDataError
    | OperationsInfrastructureError
  >;
  readonly retryDownloadById: (
    id: number,
  ) => Effect.Effect<
    void,
    | DatabaseError
    | DownloadNotFoundError
    | DownloadConflictError
    | OperationsStoredDataError
    | OperationsInfrastructureError
  >;
}

export function makeDownloadTorrentActionSupport(input: DownloadTorrentActionSupportInput) {
  const { db, torrentClientService, tryDatabasePromise } = input;
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

    if (row.infoHash) {
      if (action === "pause") {
        yield* torrentClientService
          .pauseTorrentIfEnabled(row.infoHash)
          .pipe(Effect.asVoid, Effect.mapError(mapQBitError("Failed to pause download")));
      } else if (action === "resume") {
        yield* torrentClientService
          .resumeTorrentIfEnabled(row.infoHash)
          .pipe(Effect.asVoid, Effect.mapError(mapQBitError("Failed to resume download")));
      } else {
        yield* torrentClientService
          .deleteTorrentIfEnabled(row.infoHash, deleteFiles)
          .pipe(Effect.asVoid, Effect.mapError(mapQBitError("Failed to remove download")));
      }
    }

    const coveredEpisodes = yield* parseCoveredEpisodesEffect(row.coveredEpisodes);

    if (action === "delete") {
      const sourceMetadata = yield* decodeDownloadSourceMetadata(row.sourceMetadata);
      yield* recordDownloadEvent(
        db,
        {
          animeId: row.animeId,
          downloadId: row.id,
          eventType: "download.deleted",
          fromStatus: row.status,
          metadataJson: {
            covered_episodes: coveredEpisodes,
            ...(sourceMetadata ? { source_metadata: sourceMetadata } : {}),
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

    const actionSourceMetadata = yield* decodeDownloadSourceMetadata(row.sourceMetadata);
    yield* recordDownloadEvent(
      db,
      {
        animeId: row.animeId,
        downloadId: row.id,
        eventType: `download.${action}d`,
        fromStatus: row.status,
        metadataJson: {
          covered_episodes: coveredEpisodes,
          ...(actionSourceMetadata ? { source_metadata: actionSourceMetadata } : {}),
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

    const coveredEpisodes = yield* parseCoveredEpisodesEffect(row.coveredEpisodes);
    const qbitResult = yield* torrentClientService
      .addTorrentUrlIfEnabled(row.magnet)
      .pipe(Effect.either);

    if (qbitResult._tag === "Left") {
      return yield* mapQBitError("Failed to retry download")(qbitResult.left);
    }

    const startedInQBit = qbitResult.right._tag === "Added";

    const retryNow = yield* nowIso();
    yield* tryDatabasePromise("Failed to retry download", () =>
      db
        .update(downloads)
        .set({
          errorMessage: null,
          externalState: startedInQBit ? "downloading" : "queued",
          lastErrorAt: null,
          lastSyncedAt: retryNow,
          progress: 0,
          retryCount: sql`${downloads.retryCount} + 1`,
          status: startedInQBit ? "downloading" : "queued",
        })
        .where(eq(downloads.id, id)),
    );

    const retrySourceMetadata = yield* decodeDownloadSourceMetadata(row.sourceMetadata);
    yield* recordDownloadEvent(
      db,
      {
        animeId: row.animeId,
        downloadId: row.id,
        eventType: "download.retried",
        fromStatus: row.status,
        metadataJson: {
          covered_episodes: coveredEpisodes,
          ...(retrySourceMetadata ? { source_metadata: retrySourceMetadata } : {}),
        },
        message: `Retried ${row.torrentName}`,
        toStatus: startedInQBit ? "downloading" : "queued",
      },
      nowIso,
    );
  });

  return {
    applyDownloadActionEffect,
    retryDownloadById,
  };
}
