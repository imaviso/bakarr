import { Effect, Option } from "effect";
import { eq } from "drizzle-orm";

import type { DownloadAction, DownloadSourceMetadata } from "@packages/shared/index.ts";
import { DatabaseError, type AppDatabase } from "@/db/database.ts";
import { anime, downloads } from "@/db/schema.ts";
import { TorrentClientService } from "@/features/operations/torrent-client-service.ts";
import { requireAnime } from "@/features/operations/repository/anime-repository.ts";
import { encodeDownloadSourceMetadata } from "@/features/operations/repository/download-repository.ts";
import { loadMissingEpisodeNumbers } from "@/features/operations/job-support.ts";
import {
  buildDownloadSelectionMetadata,
  buildDownloadSourceMetadataFromRelease,
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
  readonly sourceMetadata: DownloadSourceMetadata;
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
      ...(input.triggerInput.episode_number === undefined
        ? {}
        : { explicitEpisode: input.triggerInput.episode_number }),
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
    const coveredEpisodes = yield* toCoveredEpisodesJson(inferredCoveredEpisodes);
    const releaseContext = input.triggerInput.release_context;
    const selectionMetadata = buildDownloadSelectionMetadata(releaseContext?.download_action);
    const chosenFromSeadex =
      selectionMetadata.chosen_from_seadex ??
      (releaseContext?.is_seadex_best || releaseContext?.is_seadex ? true : undefined);
    const sourceMetadata = buildDownloadSourceMetadataFromRelease(
      toSourceMetadataInput({
        chosenFromSeadex,
        effectiveIsBatch,
        releaseContext,
        selectionMetadata,
        title: input.triggerInput.title,
      }),
    );
    const explicitInfoHash = releaseContext?.info_hash
      ? Option.some(releaseContext.info_hash.toLowerCase())
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
  const encodedSourceMetadata = yield* encodeDownloadSourceMetadata(input.plan.sourceMetadata);

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
          groupName: input.triggerInput.release_context?.group ?? null,
          infoHash: input.plan.infoHash,
          lastSyncedAt: input.plan.now,
          magnet: input.triggerInput.magnet,
          progress: 0,
          savePath: null,
          sourceMetadata: encodedSourceMetadata,
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

  const insertedRow = insertResult.right[0];

  if (!insertedRow) {
    return yield* new OperationsInfrastructureError({
      message: "Failed to trigger download",
      cause: new Error("Insert returned no rows"),
    });
  }

  return insertedRow.id;
});

export const addMagnetToQueuedDownload = Effect.fn("Operations.addMagnetToQueuedDownload")(
  function* (input: {
    readonly db: AppDatabase;
    readonly insertedId: number;
    readonly magnet: string;
    readonly torrentClientService: typeof TorrentClientService.Service;
    readonly tryDatabasePromise: TryDatabasePromise;
  }) {
    const qbitResult = yield* Effect.either(
      input.torrentClientService.addTorrentUrlIfEnabled(input.magnet),
    );

    if (qbitResult._tag === "Left") {
      const cleanupResult = yield* Effect.either(
        input.tryDatabasePromise("Cleanup failed download", () =>
          input.db.delete(downloads).where(eq(downloads.id, input.insertedId)),
        ),
      );

      if (cleanupResult._tag === "Left") {
        yield* Effect.logWarning(
          "Failed to clean up queued download after qBittorrent add failure",
        ).pipe(
          Effect.annotateLogs({
            cleanupError: cleanupResult.left.message,
            downloadId: input.insertedId,
          }),
        );
      }

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

function deriveTriggerDecisionReason(input: {
  action?: DownloadAction | undefined;
  isBatch: boolean;
  isSeadex?: boolean | undefined;
  isSeadexBest?: boolean | undefined;
  trusted?: boolean | undefined;
}) {
  if (input.action?.Upgrade) {
    return input.action.Upgrade.reason;
  }

  if (input.action?.Accept) {
    return `Accepted (${input.action.Accept.quality.name}, score ${input.action.Accept.score})`;
  }

  const batchSegment = input.isBatch ? " Batch" : "";

  if (input.isSeadexBest) {
    return `${batchSegment} SeaDex Best release`.trim();
  }

  if (input.isSeadex) {
    return `${batchSegment} SeaDex recommended release`.trim();
  }

  const trustedSegment = input.trusted ? " trusted" : "";
  return `Manual${batchSegment.toLowerCase()} grab from${trustedSegment} release search`;
}

function toSourceMetadataInput(input: {
  chosenFromSeadex: boolean | undefined;
  effectiveIsBatch: boolean;
  releaseContext: TriggerDownloadInput["release_context"];
  selectionMetadata: ReturnType<typeof buildDownloadSelectionMetadata>;
  title: string;
}) {
  const releaseContext = input.releaseContext;

  return {
    ...(input.chosenFromSeadex === undefined ? {} : { chosenFromSeadex: input.chosenFromSeadex }),
    decisionReason: deriveTriggerDecisionReason({
      action: releaseContext?.download_action,
      isBatch: input.effectiveIsBatch,
      isSeadex: releaseContext?.is_seadex,
      isSeadexBest: releaseContext?.is_seadex_best,
      trusted: releaseContext?.trusted,
    }),
    ...(releaseContext?.group === undefined ? {} : { group: releaseContext.group }),
    indexer: releaseContext?.indexer ?? "Nyaa",
    ...(releaseContext?.is_seadex === undefined ? {} : { isSeadex: releaseContext.is_seadex }),
    ...(releaseContext?.is_seadex_best === undefined
      ? {}
      : { isSeadexBest: releaseContext.is_seadex_best }),
    ...(input.selectionMetadata.previous_quality === undefined
      ? {}
      : { previousQuality: input.selectionMetadata.previous_quality }),
    ...(input.selectionMetadata.previous_score === undefined
      ? {}
      : { previousScore: input.selectionMetadata.previous_score }),
    ...(releaseContext?.remake === undefined ? {} : { remake: releaseContext.remake }),
    ...(releaseContext?.parsed_resolution === undefined
      ? {}
      : { resolution: releaseContext.parsed_resolution }),
    ...(releaseContext?.seadex_comparison === undefined
      ? {}
      : { seadexComparison: releaseContext.seadex_comparison }),
    ...(releaseContext?.seadex_dual_audio === undefined
      ? {}
      : { seadexDualAudio: releaseContext.seadex_dual_audio }),
    ...(releaseContext?.seadex_notes === undefined
      ? {}
      : { seadexNotes: releaseContext.seadex_notes }),
    ...(releaseContext?.seadex_release_group === undefined
      ? {}
      : { seadexReleaseGroup: releaseContext.seadex_release_group }),
    ...(releaseContext?.seadex_tags === undefined
      ? {}
      : { seadexTags: releaseContext.seadex_tags }),
    selectionKind: input.selectionMetadata.selection_kind ?? "manual",
    ...(input.selectionMetadata.selection_score === undefined
      ? {}
      : { selectionScore: input.selectionMetadata.selection_score }),
    ...(releaseContext?.source_url === undefined ? {} : { sourceUrl: releaseContext.source_url }),
    title: input.title,
    ...(releaseContext?.trusted === undefined ? {} : { trusted: releaseContext.trusted }),
  };
}
