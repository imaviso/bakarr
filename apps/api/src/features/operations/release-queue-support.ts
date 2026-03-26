import { eq } from "drizzle-orm";
import { Effect } from "effect";

import type { DownloadSourceMetadata } from "../../../../../packages/shared/src/index.ts";
import { DatabaseError } from "../../db/database.ts";
import type { AppDatabase } from "../../db/database.ts";
import { anime, downloads } from "../../db/schema.ts";
import type { OperationsError } from "./errors.ts";
import type { ExternalCallError } from "../../lib/effect-retry.ts";
import { recordDownloadEvent } from "./job-support.ts";
import { hasOverlappingDownload, parseCoveredEpisodesEffect } from "./download-lifecycle.ts";
import type { QBitConfig, QBitTorrentClient } from "./qbittorrent.ts";
import { encodeDownloadSourceMetadata } from "./repository.ts";
import type { ParsedRelease } from "./rss-client.ts";
import type { TryDatabasePromise } from "../../lib/effect-db.ts";

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
    qbitClient: typeof QBitTorrentClient.Service;
    qbitConfig: QBitConfig | null;
    nowIso: () => Effect.Effect<string>;
    tryDatabasePromise: TryDatabasePromise;
    wrapOperationsError: (
      message: string,
    ) => (cause: unknown) => ExternalCallError | OperationsError | DatabaseError;
  }) {
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
            sourceMetadata: encodeDownloadSourceMetadata(input.sourceMetadata),
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

    const insertedId = insertResult.right[0].id;
    let status = "queued";

    if (input.qbitConfig) {
      const qbitResult = yield* Effect.either(
        input.qbitClient.addTorrentUrl(input.qbitConfig, input.item.magnet),
      );

      if (qbitResult._tag === "Left") {
        yield* input.tryDatabasePromise("Cleanup failed download", () =>
          input.db.delete(downloads).where(eq(downloads.id, insertedId)),
        );
        return yield* input.wrapOperationsError(input.contextMessage)(qbitResult.left);
      }

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
