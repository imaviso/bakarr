import type { DownloadAction, DownloadSourceMetadata } from "@packages/shared/index.ts";
import { media } from "@/db/schema.ts";
import { MediaRepository } from "@/features/media/shared/media-repository.ts";
import {
  buildDownloadSelectionMetadata,
  buildDownloadSourceMetadataFromRelease,
} from "@/features/operations/library/naming-source-metadata-support.ts";
import { resolveDownloadCoveragePlan } from "@/features/operations/download/download-queue-support.ts";
import { toCoveredUnitsJson } from "@/features/operations/download/download-coverage.ts";
import { parseMagnetInfoHash } from "@/features/operations/download/download-paths.ts";
import { DomainInputError } from "@/features/errors.ts";
import type { TriggerDownloadInput } from "@/features/operations/download/download-orchestration-shared.ts";
import { Effect, Option } from "effect";

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

export const prepareTriggerDownload = Effect.fn("Operations.prepareTriggerDownload")(
  function* (input: {
    readonly mediaRepository: typeof MediaRepository.Service;
    readonly nowIso: () => Effect.Effect<string>;
    readonly triggerInput: TriggerDownloadInput;
  }) {
    const animeRow = yield* input.mediaRepository.getMediaRow(input.triggerInput.media_id);
    const now = yield* input.nowIso();
    const missingRows = yield* input.mediaRepository.listMissingUnitNumbers([animeRow.id]);
    const missingUnits = missingRows
      .map((row) => row.number)
      .toSorted((left, right) => left - right);
    const plan = resolveDownloadCoveragePlan({
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

    const coveredUnits = yield* toCoveredUnitsJson(inferredCoveredEpisodes);
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
