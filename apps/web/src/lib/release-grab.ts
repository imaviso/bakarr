import type {
  DownloadAction,
  EpisodeSearchResult,
  NyaaSearchResult,
  SearchDownloadReleaseContext,
  SearchDownloadRequest,
} from "~/lib/api";
import { formatReleaseSearchDecisionReason, inferBatchKind } from "~/lib/batch-kind";

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
  coveredEpisodes?: readonly number[] | undefined;
  isBatch?: boolean | undefined;
  isSeaDex: boolean;
  isSeaDexBest: boolean;
  trusted: boolean;
}) {
  return formatReleaseSearchDecisionReason({
    batchKind: inferBatchKind({
      coveredEpisodes: input.coveredEpisodes,
      isBatch: input.isBatch,
    }),
    isSeaDex: input.isSeaDex,
    isSeaDexBest: input.isSeaDexBest,
    trusted: input.trusted,
  });
}

export function buildGrabInputFromNyaaResult(input: {
  animeId: number;
  result: NyaaSearchResult;
  episodeNumber?: number | undefined;
  isBatch?: boolean | undefined;
}): SearchDownloadRequest {
  const { animeId, episodeNumber, isBatch, result } = input;

  return {
    anime_id: animeId,
    magnet: result.magnet,
    ...(episodeNumber === undefined ? {} : { episode_number: episodeNumber }),
    release_context: toReleaseContextFromNyaaResult(result),
    title: result.title,
    ...(isBatch ? { is_batch: true } : {}),
  };
}

export function decisionReasonFromEpisodeResult(result: EpisodeSearchResult) {
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
      coveredEpisodes: result.parsed_episode_numbers,
      isBatch:
        (result.parsed_episode_numbers?.length ?? 0) > 1 ||
        (result.parsed_episode_label !== undefined && result.parsed_episode_numbers === undefined),
      sourceIdentity: result.parsed_air_date
        ? {
            air_dates: [result.parsed_air_date],
            label: result.parsed_episode_label ?? result.parsed_air_date,
            scheme: "daily",
          }
        : result.parsed_episode_numbers
          ? {
              episode_numbers: result.parsed_episode_numbers,
              label:
                result.parsed_episode_label ??
                String(result.parsed_episode_numbers[0] ?? "").padStart(2, "0"),
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
  animeId: number;
  episodeNumber: number;
  result: EpisodeSearchResult;
}): SearchDownloadRequest {
  return {
    anime_id: input.animeId,
    episode_number: input.episodeNumber,
    title: input.result.title,
    magnet: input.result.link,
    release_context: toReleaseContextFromEpisodeResult(input.result),
  };
}

export function actionReasonFromDownloadAction(action: DownloadAction) {
  if (action.Reject) return action.Reject.reason;
  if (action.Upgrade) return action.Upgrade.reason;
  return null;
}

function toReleaseContextFromNyaaResult(result: NyaaSearchResult): SearchDownloadReleaseContext {
  return {
    ...(result.parsed_group === undefined ? {} : { group: result.parsed_group }),
    indexer: result.indexer,
    ...(result.info_hash === undefined ? {} : { info_hash: result.info_hash }),
    ...(result.parsed_resolution === undefined
      ? {}
      : { parsed_resolution: result.parsed_resolution }),
    ...(result.trusted === undefined ? {} : { trusted: result.trusted }),
    ...(result.remake === undefined ? {} : { remake: result.remake }),
    ...(result.view_url === undefined ? {} : { source_url: result.view_url }),
    ...(result.is_seadex === undefined ? {} : { is_seadex: result.is_seadex }),
    ...(result.is_seadex_best === undefined ? {} : { is_seadex_best: result.is_seadex_best }),
    ...(result.seadex_release_group === undefined
      ? {}
      : { seadex_release_group: result.seadex_release_group }),
    ...(result.seadex_tags === undefined ? {} : { seadex_tags: result.seadex_tags }),
    ...(result.seadex_notes === undefined ? {} : { seadex_notes: result.seadex_notes }),
    ...(result.seadex_comparison === undefined
      ? {}
      : { seadex_comparison: result.seadex_comparison }),
    ...(result.seadex_dual_audio === undefined
      ? {}
      : { seadex_dual_audio: result.seadex_dual_audio }),
  };
}

function toReleaseContextFromEpisodeResult(
  result: EpisodeSearchResult,
): SearchDownloadReleaseContext {
  return {
    ...(result.group === undefined ? {} : { group: result.group }),
    indexer: result.indexer,
    ...(result.info_hash === undefined ? {} : { info_hash: result.info_hash }),
    ...(result.parsed_resolution === undefined
      ? {}
      : { parsed_resolution: result.parsed_resolution }),
    ...(result.trusted === undefined ? {} : { trusted: result.trusted }),
    ...(result.remake === undefined ? {} : { remake: result.remake }),
    ...(result.view_url === undefined ? {} : { source_url: result.view_url }),
    ...(result.is_seadex === undefined ? {} : { is_seadex: result.is_seadex }),
    ...(result.is_seadex_best === undefined ? {} : { is_seadex_best: result.is_seadex_best }),
    ...(result.seadex_release_group === undefined
      ? {}
      : { seadex_release_group: result.seadex_release_group }),
    ...(result.seadex_tags === undefined ? {} : { seadex_tags: result.seadex_tags }),
    ...(result.seadex_notes === undefined ? {} : { seadex_notes: result.seadex_notes }),
    ...(result.seadex_comparison === undefined
      ? {}
      : { seadex_comparison: result.seadex_comparison }),
    ...(result.seadex_dual_audio === undefined
      ? {}
      : { seadex_dual_audio: result.seadex_dual_audio }),
    download_action: result.download_action,
  };
}
