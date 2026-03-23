import { eq } from "drizzle-orm";
import { Effect } from "effect";

import type { DownloadSourceMetadata } from "../../../../../packages/shared/src/index.ts";
import type { AppDatabase, DatabaseError } from "../../db/database.ts";
import { anime, downloads } from "../../db/schema.ts";
import type { ExternalCallError, OperationsError } from "./errors.ts";
import { nowIso, recordDownloadEvent } from "./job-support.ts";
import {
  hasOverlappingDownload,
  parseCoveredEpisodes,
} from "./download-lifecycle.ts";
import type { QBitConfig, QBitTorrentClient } from "./qbittorrent.ts";
import { encodeDownloadSourceMetadata } from "./repository.ts";
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
  sourceMetadata: DownloadSourceMetadata;
  qbitClient: typeof QBitTorrentClient.Service;
  qbitConfig: QBitConfig | null;
  tryDatabasePromise: TryDatabasePromise;
  wrapOperationsError: (
    message: string,
  ) => (cause: unknown) => ExternalCallError | OperationsError | DatabaseError;
}) {
  const coveredEpisodeNumbers = parseCoveredEpisodes(input.coveredEpisodes);
  const now = yield* nowIso;
  const insertResult = yield* Effect.either(input.tryDatabasePromise(
    input.contextMessage,
    () =>
      input.db.transaction(async (tx) => {
        const overlapping = await hasOverlappingDownload(
          tx as unknown as AppDatabase,
          input.animeRow.id,
          input.item.infoHash,
          coveredEpisodeNumbers,
        );

        if (overlapping) {
          return { _tag: "overlap" } as const;
        }

        const inserted = await tx.insert(downloads).values({
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
        }).returning({ id: downloads.id });

        return {
          _tag: "inserted",
          id: inserted[0].id,
        } as const;
      }, { behavior: "immediate" }),
  ));

  if (insertResult._tag === "Left") {
    const dbError = insertResult.left;

    if (dbError.isUniqueConstraint()) {
      return { _tag: "skipped" } as const;
    }

    return yield* dbError;
  }

  if (insertResult.right._tag === "overlap") {
    return { _tag: "skipped" } as const;
  }

  const insertedId = insertResult.right.id;
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

  yield* recordDownloadEvent(input.db, {
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
  });

  return {
    _tag: "queued",
    id: insertedId,
    status,
  } as const;
});
