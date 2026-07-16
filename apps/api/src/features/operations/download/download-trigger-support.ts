import { Effect, Option } from "effect";

import type { DownloadAction, DownloadSourceMetadata } from "@packages/shared/index.ts";
import { DatabaseError } from "@/db/database.ts";
import { media } from "@/db/schema.ts";
import { TorrentClientService } from "@/features/operations/qbittorrent/torrent-client-service.ts";
import { MediaReadRepository } from "@/features/media/shared/media-read-repository.ts";
import { DownloadRepository } from "@/features/operations/repository/download-repository-service.ts";
import { encodeDownloadSourceMetadata } from "@/features/operations/repository/download-repository.ts";
import {
  buildDownloadSelectionMetadata,
  buildDownloadSourceMetadataFromRelease,
} from "@/features/operations/library/naming-metadata-support.ts";
import {
  inferCoveredEpisodeNumbers,
  parseCoveredEpisodesEffect,
  toCoveredEpisodesJson,
} from "@/features/operations/download/download-coverage.ts";
import { parseMagnetInfoHash } from "@/features/operations/download/download-paths.ts";
import { parseReleaseName } from "@/features/operations/search/release-ranking.ts";
import { parseVolumeNumbersFromTitle } from "@/features/operations/search/release-volume.ts";
import { DomainInputError, InfrastructureError } from "@/features/errors.ts";
import { OperationsConflictError } from "@/features/operations/errors.ts";
import type { TriggerDownloadInput } from "@/features/operations/download/download-orchestration-shared.ts";
import { resolveRequestedEpisodeNumber } from "@/features/operations/download/download-orchestration-shared.ts";

const IN_FLIGHT_STATUSES = new Set(["queued", "downloading", "paused"]);

export interface PreparedTriggerDownload {
  readonly animeRow: typeof media.$inferSelect;
  readonly coveredUnits: string | null;
  readonly effectiveIsBatch: boolean;
  readonly infoHash: string | null;
  readonly inferredCoveredEpisodes: readonly number[];
  readonly now: string;
  readonly requestedEpisode: number;
  readonly sourceMetadata: DownloadSourceMetadata;
}

export function resolveTriggerDownloadCoveragePlan(input: {
  readonly explicitIsBatch?: boolean;
  readonly explicitUnitNumber?: number;
  readonly mediaKind: (typeof media.$inferSelect)["mediaKind"];
  readonly missingUnits: readonly number[];
  readonly title: string;
  readonly totalUnits?: number | null;
}) {
  const parsedRelease = parseReleaseName(input.title);
  const parsedVolumes = parseVolumeNumbersFromTitle(input.title);
  const inferredUnits = input.mediaKind === "anime" ? parsedRelease.unitNumbers : parsedVolumes;
  const effectiveIsBatch =
    input.explicitIsBatch ??
    (input.mediaKind === "anime" ? parsedRelease.isBatch : parsedVolumes.length > 1);
  const requestedEpisode = resolveRequestedEpisodeNumber({
    ...(input.explicitUnitNumber === undefined
      ? {}
      : { explicitEpisode: input.explicitUnitNumber }),
    inferredEpisodes: inferredUnits,
    isBatch: effectiveIsBatch,
  });

  if (!requestedEpisode) {
    return {
      effectiveIsBatch,
      inferredCoveredEpisodes: [] as readonly number[],
      inferredUnits,
      requestedEpisode,
    };
  }

  const shouldDeferBatchCoverage = effectiveIsBatch && inferredUnits.length === 0;
  const inferredCoveredEpisodes = shouldDeferBatchCoverage
    ? []
    : inferCoveredEpisodeNumbers({
        explicitEpisodes: inferredUnits,
        isBatch: effectiveIsBatch,
        ...(input.totalUnits === undefined ? {} : { totalUnits: input.totalUnits }),
        missingUnits: input.missingUnits,
        requestedEpisode,
      });

  return {
    effectiveIsBatch,
    inferredCoveredEpisodes,
    inferredUnits,
    requestedEpisode,
  };
}

export const prepareTriggerDownload = Effect.fn("Operations.prepareTriggerDownload")(
  function* (input: {
    readonly triggerRepo: typeof DownloadRepository.Service;
    readonly mediaReadRepository: typeof MediaReadRepository.Service;
    readonly nowIso: () => Effect.Effect<string>;
    readonly triggerInput: TriggerDownloadInput;
  }) {
    const animeRow = yield* input.mediaReadRepository.getMediaRow(input.triggerInput.media_id);
    const now = yield* input.nowIso();
    const missingRows = yield* input.mediaReadRepository.listMissingUnitNumbers([animeRow.id]);
    const missingUnits = missingRows
      .map((row) => row.number)
      .toSorted((left, right) => left - right);
    const plan = resolveTriggerDownloadCoveragePlan({
      ...(input.triggerInput.is_batch === undefined
        ? {}
        : { explicitIsBatch: input.triggerInput.is_batch }),
      ...(input.triggerInput.unit_number === undefined
        ? {}
        : { explicitUnitNumber: input.triggerInput.unit_number }),
      mediaKind: animeRow.mediaKind,
      missingUnits,
      title: input.triggerInput.title,
      totalUnits: animeRow.unitCount,
    });
    const { effectiveIsBatch, inferredCoveredEpisodes, requestedEpisode } = plan;

    if (!requestedEpisode) {
      return yield* new DomainInputError({
        message:
          "unit_number is required when the release title does not include episode information",
      });
    }

    const coveredUnits = yield* toCoveredEpisodesJson(inferredCoveredEpisodes);
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
      const existingByHash = yield* input.triggerRepo.lookupDownloadByInfoHash(infoHash);

      if (existingByHash && IN_FLIGHT_STATUSES.has(existingByHash.status)) {
        return yield* new OperationsConflictError({
          message: "An in-flight download already covers these mediaUnits",
        });
      }

      if (inferredCoveredEpisodes.length > 0) {
        const mediaDownloads = yield* input.triggerRepo.listDownloadsByMediaId(animeRow.id);

        for (const row of mediaDownloads) {
          if (!IN_FLIGHT_STATUSES.has(row.status)) {
            continue;
          }

          const existingCovered = yield* parseCoveredEpisodesEffect(row.coveredUnits);

          if (existingCovered.some((episode) => inferredCoveredEpisodes.includes(episode))) {
            return yield* new OperationsConflictError({
              message: "An in-flight download already covers these mediaUnits",
            });
          }
        }
      }
    }

    return {
      animeRow,
      coveredUnits,
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
  readonly triggerRepo: typeof DownloadRepository.Service;
  readonly plan: PreparedTriggerDownload;
  readonly triggerInput: TriggerDownloadInput;
}) {
  const encodedSourceMetadata = yield* encodeDownloadSourceMetadata(input.plan.sourceMetadata);

  const insertResult = yield* Effect.either(
    input.triggerRepo.insertQueuedDownloadRow({
      addedAt: input.plan.now,
      coveredUnits: input.plan.coveredUnits,
      groupName: input.triggerInput.release_context?.group ?? null,
      infoHash: input.plan.infoHash,
      isBatch: input.plan.effectiveIsBatch,
      lastSyncedAt: input.plan.now,
      magnet: input.triggerInput.magnet,
      mediaId: input.plan.animeRow.id,
      mediaTitle: input.plan.animeRow.titleRomaji,
      sourceMetadata: encodedSourceMetadata,
      torrentName: input.triggerInput.title,
      unitNumber: input.plan.requestedEpisode,
    }),
  );

  if (insertResult._tag === "Left") {
    const insertError = insertResult.left;
    if (insertError instanceof DatabaseError && insertError.isUniqueConstraint()) {
      return yield* new OperationsConflictError({
        message: "Download already exists",
      });
    }
    return yield* insertError;
  }

  return insertResult.right;
});

export const addMagnetToQueuedDownload = Effect.fn("Operations.addMagnetToQueuedDownload")(
  function* (input: {
    readonly triggerRepo: typeof DownloadRepository.Service;
    readonly insertedId: number;
    readonly magnet: string;
    readonly torrentClientService: typeof TorrentClientService.Service;
  }) {
    const qbitResult = yield* Effect.either(
      input.torrentClientService.addTorrentUrlIfEnabled(input.magnet),
    );

    if (qbitResult._tag === "Left") {
      const cleanupResult = yield* Effect.either(
        input.triggerRepo.deleteDownloadRow(input.insertedId),
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

      return yield* new InfrastructureError({
        message: "Failed to trigger download",
        cause: qbitResult.left,
      });
    }

    if (qbitResult.right._tag === "Added") {
      yield* input.triggerRepo.updateDownloadStatusRow({
        externalState: "downloading",
        id: input.insertedId,
        status: "downloading",
      });

      return "downloading" as const;
    }

    return "queued" as const;
  },
);

export function deriveTriggerDecisionReason(input: {
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
