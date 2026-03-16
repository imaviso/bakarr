import { eq } from "drizzle-orm";
import { Effect } from "effect";

import type { AppDatabase, DatabaseError } from "../../db/database.ts";
import { anime, downloads } from "../../db/schema.ts";
import type { ExternalCallError, OperationsError } from "./errors.ts";
import { nowIso, recordDownloadEvent } from "./job-support.ts";
import type { QBitConfig, QBitTorrentClient } from "./qbittorrent.ts";
import type { ParsedRelease } from "./rss-client.ts";
import type { TryDatabasePromise } from "./service-support.ts";

export const queueParsedReleaseDownload = Effect.fn(
  "OperationsService.queueParsedReleaseDownload",
)(function* (input: {
  animeRow: typeof anime.$inferSelect;
  contextMessage: string;
  coveredEpisodes: string | null;
  db: AppDatabase;
  episodeNumber: number;
  eventMessage: string;
  eventType: string;
  isBatch: boolean;
  item: ParsedRelease;
  qbitClient: typeof QBitTorrentClient.Service;
  qbitConfig: QBitConfig | null;
  tryDatabasePromise: TryDatabasePromise;
  wrapOperationsError: (
    message: string,
  ) => (cause: unknown) => ExternalCallError | OperationsError | DatabaseError;
}) {
  const insertResult = yield* Effect.either(input.tryDatabasePromise(
    input.contextMessage,
    () =>
      input.db.insert(downloads).values({
        addedAt: nowIso(),
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
        lastSyncedAt: nowIso(),
        magnet: input.item.magnet,
        progress: 0,
        savePath: null,
        speedBytes: 0,
        status: "queued",
        torrentName: input.item.title,
        totalBytes: input.item.sizeBytes,
      }).returning({ id: downloads.id }),
  ));

  if (insertResult._tag === "Left") {
    const dbError = insertResult.left;

    if (dbError.isUniqueConstraint()) {
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
      yield* input.tryDatabasePromise(
        "Cleanup failed download",
        () => input.db.delete(downloads).where(eq(downloads.id, insertedId)),
      );
      return yield* input.wrapOperationsError(input.contextMessage)(
        qbitResult.left,
      );
    }

    status = "downloading";
    yield* input.tryDatabasePromise(
      "Update download status",
      () =>
        input.db.update(downloads).set({ status, externalState: status }).where(
          eq(downloads.id, insertedId),
        ),
    );
  }

  yield* input.tryDatabasePromise(
    "Failed to record download event",
    () =>
      recordDownloadEvent(input.db, {
        animeId: input.animeRow.id,
        downloadId: insertedId,
        eventType: input.eventType,
        message: input.eventMessage,
        metadata: input.coveredEpisodes,
        toStatus: status,
      }),
  );

  return {
    _tag: "queued",
    id: insertedId,
    status,
  } as const;
});
