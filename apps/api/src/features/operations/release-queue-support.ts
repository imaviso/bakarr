import { eq } from "drizzle-orm";
import { Effect } from "effect";

import type { DownloadSourceMetadata } from "@packages/shared/index.ts";
import { DatabaseError } from "@/db/database.ts";
import type { AppDatabase } from "@/db/database.ts";
import { anime, downloads } from "@/db/schema.ts";
import { OperationsInfrastructureError } from "@/features/operations/errors.ts";
import { recordDownloadEvent } from "@/features/operations/job-support.ts";
import {
  hasOverlappingDownload,
  parseCoveredEpisodesEffect,
} from "@/features/operations/download-coverage.ts";
import { TorrentClientService } from "@/features/operations/torrent-client-service.ts";
import { encodeDownloadSourceMetadata } from "@/features/operations/repository/download-repository.ts";
import type { ParsedRelease } from "@/features/operations/rss-client-parse.ts";
import type { TryDatabasePromise } from "@/infra/effect/db.ts";

export const queueParsedReleaseDownload = Effect.fn("OperationsService.queueParsedReleaseDownload")(
  function* (input: {
    animeRow: typeof anime.$inferSelect;
    contextMessage: string;
    coveredEpisodes: string | null;
    db: AppDatabase;
    episodeNumber: number;
    eventMessage: string;
    eventType: string;
    isBatch: boolean;
    item: ParsedRelease;
    sourceMetadata: DownloadSourceMetadata;
    torrentClientService: typeof TorrentClientService.Service;
    nowIso: () => Effect.Effect<string>;
    tryDatabasePromise: TryDatabasePromise;
  }) {
    const mapQBitError = (message: string) => (cause: unknown) =>
      cause instanceof DatabaseError
        ? cause
        : new OperationsInfrastructureError({
            message,
            cause,
          });

    const coveredEpisodeNumbers = yield* parseCoveredEpisodesEffect(input.coveredEpisodes);
    const now = yield* input.nowIso();

    const overlapping = yield* hasOverlappingDownload(
      input.db,
      input.animeRow.id,
      input.item.infoHash,
      coveredEpisodeNumbers,
    );

    if (overlapping) {
      return { _tag: "skipped" } as const;
    }

    const encodedSourceMetadata = yield* encodeDownloadSourceMetadata(input.sourceMetadata);

    const insertResult = yield* Effect.either(
      input.tryDatabasePromise(input.contextMessage, () =>
        input.db
          .insert(downloads)
          .values({
            addedAt: now,
            animeId: input.animeRow.id,
            animeTitle: input.animeRow.titleRomaji,
            contentPath: null,
            coveredEpisodes: input.coveredEpisodes,
            downloadDate: null,
            downloadedBytes: 0,
            episodeNumber: input.episodeNumber,
            errorMessage: null,
            etaSeconds: null,
            externalState: "queued",
            groupName: input.item.group ?? null,
            infoHash: input.item.infoHash,
            isBatch: input.isBatch,
            lastSyncedAt: now,
            magnet: input.item.magnet,
            progress: 0,
            savePath: null,
            speedBytes: 0,
            sourceMetadata: encodedSourceMetadata,
            status: "queued",
            torrentName: input.item.title,
            totalBytes: input.item.sizeBytes,
          })
          .returning({ id: downloads.id }),
      ),
    );

    if (insertResult._tag === "Left") {
      const dbError = insertResult.left;

      if (dbError instanceof DatabaseError && dbError.isUniqueConstraint()) {
        return { _tag: "skipped" } as const;
      }

      return yield* dbError;
    }

    const insertedRow = insertResult.right[0];
    if (!insertedRow) {
      return yield* Effect.dieMessage("Insert returned no rows");
    }
    const insertedId = insertedRow.id;
    let status = "queued";

    const qbitResult = yield* Effect.either(
      input.torrentClientService.addTorrentUrlIfEnabled(input.item.magnet),
    );

    if (qbitResult._tag === "Left") {
      yield* input.tryDatabasePromise("Cleanup failed download", () =>
        input.db.delete(downloads).where(eq(downloads.id, insertedId)),
      );
      return yield* mapQBitError(input.contextMessage)(qbitResult.left);
    }

    if (qbitResult.right._tag === "Added") {
      status = "downloading";
      yield* input.tryDatabasePromise("Update download status", () =>
        input.db
          .update(downloads)
          .set({ status, externalState: status })
          .where(eq(downloads.id, insertedId)),
      );
    }

    yield* recordDownloadEvent(
      input.db,
      {
        animeId: input.animeRow.id,
        downloadId: insertedId,
        eventType: input.eventType,
        message: input.eventMessage,
        metadata: input.coveredEpisodes,
        metadataJson: {
          covered_episodes: coveredEpisodeNumbers,
          source_metadata: input.sourceMetadata,
        },
        toStatus: status,
      },
      input.nowIso,
    );

    return {
      _tag: "queued",
      id: insertedId,
      status,
    } as const;
  },
);
