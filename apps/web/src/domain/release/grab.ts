import type {
  DownloadAction,
  UnitSearchResult,
  NyaaSearchResult,
  SearchDownloadReleaseContext,
  SearchDownloadRequest,
} from "~/api/contracts";
import { brandMediaId } from "@bakarr/shared";
import { formatReleaseSearchDecisionReason, inferBatchKind } from "~/domain/batch-kind";

export interface NyaaSelectionMetadata {
  chosen_from_seadex?: boolean | undefined;
  selection_kind: "accept" | "manual";
}

export function selectionMetadataFromNyaaResult(result: NyaaSearchResult): NyaaSelectionMetadata {
  if (result.is_seadex_best || result.is_seadex) {
    return {
      chosen_from_seadex: true,
      selection_kind: "accept",
    };
  }

  return { selection_kind: "manual" };
}

export function decisionReasonFromNyaaResult(input: {
  coveredUnits?: readonly number[] | undefined;
  isBatch?: boolean | undefined;
  isSeaDex: boolean;
  isSeaDexBest: boolean;
  trusted: boolean;
}) {
  return formatReleaseSearchDecisionReason({
    batchKind: inferBatchKind({
      coveredUnits: input.coveredUnits,
      isBatch: input.isBatch,
    }),
    isSeaDex: input.isSeaDex,
    isSeaDexBest: input.isSeaDexBest,
    trusted: input.trusted,
  });
}

export function buildGrabInputFromNyaaResult(input: {
  mediaId: number;
  result: NyaaSearchResult;
  unitNumber?: number | undefined;
  isBatch?: boolean | undefined;
}): SearchDownloadRequest {
  const { mediaId, unitNumber, isBatch, result } = input;

  return {
    media_id: brandMediaId(mediaId),
    magnet: result.magnet,
    ...(unitNumber === undefined ? {} : { unit_number: unitNumber }),
    release_context: toReleaseContext({
      ...result,
      group: result.parsed_group,
      seadex_comparison:
        typeof result.seadex_comparison === "string" ? result.seadex_comparison : undefined,
    }),
    title: result.title,
    ...(isBatch ? { is_batch: true } : {}),
  };
}

export function decisionReasonFromEpisodeResult(result: UnitSearchResult) {
  if (result.download_action.Upgrade) {
    return `Upgrade: ${result.download_action.Upgrade.reason}`;
  }
  if (result.download_action.Accept) {
    return `Accepted ${result.download_action.Accept.quality.name} (score ${result.download_action.Accept.score})`;
  }
  if (result.download_action.Reject) {
    return `Manual override: ${result.download_action.Reject.reason}`;
  }

  return formatReleaseSearchDecisionReason({
    batchKind: inferBatchKind({
      coveredUnits: result.parsed_unit_numbers,
      isBatch:
        (result.parsed_unit_numbers?.length ?? 0) > 1 ||
        (result.parsed_unit_label !== undefined && result.parsed_unit_numbers === undefined),
      sourceIdentity: result.parsed_air_date
        ? {
            air_dates: [result.parsed_air_date],
            label: result.parsed_unit_label ?? result.parsed_air_date,
            scheme: "daily",
          }
        : result.parsed_unit_numbers
          ? {
              unit_numbers: result.parsed_unit_numbers,
              label:
                result.parsed_unit_label ??
                String(result.parsed_unit_numbers[0] ?? "").padStart(2, "0"),
              scheme: "absolute",
            }
          : undefined,
    }),
    isSeaDex: result.is_seadex,
    isSeaDexBest: result.is_seadex_best,
    trusted: result.trusted,
  });
}

export function buildGrabInputFromEpisodeResult(input: {
  mediaId: number;
  unitNumber: number;
  result: UnitSearchResult;
}): SearchDownloadRequest {
  return {
    media_id: brandMediaId(input.mediaId),
    unit_number: input.unitNumber,
    title: input.result.title,
    magnet: input.result.link,
    release_context: toReleaseContext(input.result, { includeDownloadAction: true }),
  };
}

export function actionReasonFromDownloadAction(action: DownloadAction) {
  if (action.Reject) return action.Reject.reason;
  if (action.Upgrade) return action.Upgrade.reason;
  return null;
}

interface ReleaseContextSource {
  indexer: string;
  group?: string | undefined;
  info_hash?: string | undefined;
  parsed_resolution?: string | undefined;
  trusted?: boolean | undefined;
  remake?: boolean | undefined;
  view_url?: string | undefined;
  is_seadex?: boolean | undefined;
  is_seadex_best?: boolean | undefined;
  seadex_release_group?: string | undefined;
  seadex_tags?: string[] | undefined;
  seadex_notes?: string | undefined;
  seadex_comparison?: string | undefined;
  seadex_dual_audio?: boolean | undefined;
  download_action?: DownloadAction | undefined;
}

function toReleaseContext(
  source: ReleaseContextSource,
  opts?: { includeDownloadAction?: boolean },
): SearchDownloadReleaseContext {
  return {
    ...(source.group === undefined ? {} : { group: source.group }),
    indexer: source.indexer,
    ...(source.info_hash === undefined ? {} : { info_hash: source.info_hash }),
    ...(source.parsed_resolution === undefined
      ? {}
      : { parsed_resolution: source.parsed_resolution }),
    ...(source.trusted === undefined ? {} : { trusted: source.trusted }),
    ...(source.remake === undefined ? {} : { remake: source.remake }),
    ...(source.view_url === undefined ? {} : { source_url: source.view_url }),
    ...(source.is_seadex === undefined ? {} : { is_seadex: source.is_seadex }),
    ...(source.is_seadex_best === undefined ? {} : { is_seadex_best: source.is_seadex_best }),
    ...(source.seadex_release_group === undefined
      ? {}
      : { seadex_release_group: source.seadex_release_group }),
    ...(source.seadex_tags === undefined ? {} : { seadex_tags: source.seadex_tags }),
    ...(source.seadex_notes === undefined ? {} : { seadex_notes: source.seadex_notes }),
    ...(source.seadex_comparison === undefined
      ? {}
      : { seadex_comparison: source.seadex_comparison }),
    ...(source.seadex_dual_audio === undefined
      ? {}
      : { seadex_dual_audio: source.seadex_dual_audio }),
    ...(source.download_action === undefined || !opts?.includeDownloadAction
      ? {}
      : { download_action: source.download_action }),
  };
}
