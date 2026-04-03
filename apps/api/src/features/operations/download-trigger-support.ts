import { Effect, Option } from "effect";
import { eq } from "drizzle-orm";

import { DatabaseError, type AppDatabase } from "@/db/database.ts";
import { anime, downloads } from "@/db/schema.ts";
import { TorrentClientService } from "@/features/operations/torrent-client-service.ts";
import { requireAnime } from "@/features/operations/repository/anime-repository.ts";
import { encodeDownloadSourceMetadata } from "@/features/operations/repository/download-repository.ts";
import { loadMissingEpisodeNumbers } from "@/features/operations/job-support.ts";
import {
  buildDownloadSourceMetadataFromRelease,
  mergeDownloadSourceMetadata,
} from "@/features/operations/naming-support.ts";
import {
  hasOverlappingDownload,
  inferCoveredEpisodeNumbers,
  toCoveredEpisodesJson,
} from "@/features/operations/download-coverage.ts";
import { parseMagnetInfoHash } from "@/features/operations/download-paths.ts";
import { parseReleaseName } from "@/features/operations/release-ranking.ts";
import {
  DownloadConflictError,
  OperationsInfrastructureError,
  OperationsInputError,
} from "@/features/operations/errors.ts";
import type { TriggerDownloadInput } from "@/features/operations/download-orchestration-shared.ts";
import { resolveRequestedEpisodeNumber } from "@/features/operations/download-orchestration-shared.ts";
import type { TryDatabasePromise } from "@/lib/effect-db.ts";

export interface PreparedTriggerDownload {
  readonly animeRow: typeof anime.$inferSelect;
  readonly coveredEpisodes: string | null;
  readonly effectiveIsBatch: boolean;
  readonly infoHash: string | null;
  readonly inferredCoveredEpisodes: readonly number[];
  readonly now: string;
  readonly requestedEpisode: number;
  readonly sourceMetadata: ReturnType<typeof buildDownloadSourceMetadataFromRelease>;
}

export const prepareTriggerDownload = Effect.fn("Operations.prepareTriggerDownload")(
  function* (input: {
    readonly db: AppDatabase;
    readonly nowIso: () => Effect.Effect<string>;
    readonly triggerInput: TriggerDownloadInput;
  }) {
    const animeRow = yield* requireAnime(input.db, input.triggerInput.anime_id);
    const now = yield* input.nowIso();
    const parsedRelease = parseReleaseName(input.triggerInput.title);
    const effectiveIsBatch = input.triggerInput.is_batch ?? parsedRelease.isBatch;
    const requestedEpisode = resolveRequestedEpisodeNumber({
      explicitEpisode: input.triggerInput.episode_number,
      inferredEpisodes: parsedRelease.episodeNumbers,
      isBatch: effectiveIsBatch,
    });

    if (!requestedEpisode) {
      return yield* new OperationsInputError({
        message:
          "episode_number is required when the release title does not include episode information",
      });
    }

    const missingEpisodes = yield* loadMissingEpisodeNumbers(input.db, animeRow.id);
    const shouldDeferBatchCoverage = effectiveIsBatch && parsedRelease.episodeNumbers.length === 0;
    const inferredCoveredEpisodes = shouldDeferBatchCoverage
      ? []
      : inferCoveredEpisodeNumbers({
          explicitEpisodes: parsedRelease.episodeNumbers,
          isBatch: effectiveIsBatch,
          totalEpisodes: animeRow.episodeCount,
          missingEpisodes,
          requestedEpisode,
        });
    const coveredEpisodes = toCoveredEpisodesJson(inferredCoveredEpisodes);
    const sourceMetadata = mergeDownloadSourceMetadata(
      buildDownloadSourceMetadataFromRelease({
        chosenFromSeadex:
          input.triggerInput.release_metadata?.chosen_from_seadex ??
          input.triggerInput.release_metadata?.is_seadex,
        decisionReason: input.triggerInput.decision_reason,
        group: input.triggerInput.group,
        indexer: "Nyaa",
        previousQuality: input.triggerInput.release_metadata?.previous_quality,
        previousScore: input.triggerInput.release_metadata?.previous_score,
        selectionKind: input.triggerInput.release_metadata?.selection_kind ?? "manual",
        selectionScore: input.triggerInput.release_metadata?.selection_score,
        sourceUrl: input.triggerInput.release_metadata?.source_url,
        title: input.triggerInput.title,
      }),
      input.triggerInput.release_metadata,
    );
    const explicitInfoHash = input.triggerInput.info_hash
      ? Option.some(input.triggerInput.info_hash.toLowerCase())
      : Option.none();
    const inferredInfoHash = parseMagnetInfoHash(input.triggerInput.magnet);
    const infoHash = Option.getOrNull(
      Option.isSome(explicitInfoHash) ? explicitInfoHash : inferredInfoHash,
    );

    if (infoHash) {
      const overlapping = yield* hasOverlappingDownload(
        input.db,
        animeRow.id,
        infoHash,
        inferredCoveredEpisodes,
      );

      if (overlapping) {
        return yield* new DownloadConflictError({
          message: "An in-flight download already covers these episodes",
        });
      }
    }

    return {
      animeRow,
      coveredEpisodes,
      effectiveIsBatch,
      infoHash,
      inferredCoveredEpisodes,
      now,
      requestedEpisode,
      sourceMetadata,
    } satisfies PreparedTriggerDownload;
  },
);

export const insertQueuedDownload = Effect.fn("Operations.insertQueuedDownload")(function* (input: {
  readonly db: AppDatabase;
  readonly plan: PreparedTriggerDownload;
  readonly triggerInput: TriggerDownloadInput;
  readonly tryDatabasePromise: TryDatabasePromise;
}) {
  const insertResult = yield* Effect.either(
    input.tryDatabasePromise("Failed to trigger download", () =>
      input.db
        .insert(downloads)
        .values({
          addedAt: input.plan.now,
          animeId: input.plan.animeRow.id,
          animeTitle: input.plan.animeRow.titleRomaji,
          contentPath: null,
          coveredEpisodes: input.plan.coveredEpisodes,
          downloadDate: null,
          episodeNumber: input.plan.requestedEpisode,
          isBatch: input.plan.effectiveIsBatch,
          downloadedBytes: 0,
          errorMessage: null,
          etaSeconds: null,
          externalState: "queued",
          groupName: input.triggerInput.group ?? null,
          infoHash: input.plan.infoHash,
          lastSyncedAt: input.plan.now,
          magnet: input.triggerInput.magnet,
          progress: 0,
          savePath: null,
          sourceMetadata: encodeDownloadSourceMetadata(input.plan.sourceMetadata),
          speedBytes: 0,
          status: "queued",
          torrentName: input.triggerInput.title,
          totalBytes: null,
        })
        .returning({ id: downloads.id }),
    ),
  );

  if (insertResult._tag === "Left") {
    const insertError = insertResult.left;
    if (insertError instanceof DatabaseError && insertError.isUniqueConstraint()) {
      return yield* new DownloadConflictError({
        message: "Download already exists",
      });
    }
    return yield* insertError;
  }

  return insertResult.right[0].id;
});

export const addMagnetToQueuedDownload = Effect.fn("Operations.addMagnetToQueuedDownload")(
  function* (input: {
    readonly db: AppDatabase;
    readonly insertedId: number;
    readonly magnet: string | null | undefined;
    readonly torrentClientService: typeof TorrentClientService.Service;
    readonly tryDatabasePromise: TryDatabasePromise;
  }) {
    if (!input.magnet) {
      return "queued" as const;
    }

    const qbitResult = yield* Effect.either(
      input.torrentClientService.addTorrentUrlIfEnabled(input.magnet),
    );

    if (qbitResult._tag === "Left") {
      yield* input.tryDatabasePromise("Cleanup failed download", () =>
        input.db.delete(downloads).where(eq(downloads.id, input.insertedId)),
      );
      return yield* new OperationsInfrastructureError({
        message: "Failed to trigger download",
        cause: qbitResult.left,
      });
    }

    if (qbitResult.right._tag === "Added") {
      yield* input.tryDatabasePromise("Update download status", () =>
        input.db
          .update(downloads)
          .set({ externalState: "downloading", status: "downloading" })
          .where(eq(downloads.id, input.insertedId)),
      );

      return "downloading" as const;
    }

    return "queued" as const;
  },
);
