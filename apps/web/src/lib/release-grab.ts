import type { DownloadAction, EpisodeSearchResult, NyaaSearchResult } from "~/lib/api";
import { formatReleaseSearchDecisionReason, inferBatchKind } from "~/lib/batch-kind";
import { buildDownloadSourceMetadata, buildParsedEpisodeIdentity } from "~/lib/release-download";
import { selectionMetadataFromDownloadAction } from "~/lib/release-selection";

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
}) {
  const { animeId, episodeNumber, isBatch, result } = input;
  const selection = selectionMetadataFromNyaaResult(result);
  const sourceIdentity = buildParsedEpisodeIdentity({
    parsedAirDate: result.parsed_air_date,
    parsedEpisodeLabel: result.parsed_episode_label,
    parsedEpisodeNumbers: result.parsed_episode_numbers,
  });

  return {
    animeId,
    decisionReason: decisionReasonFromNyaaResult({
      coveredEpisodes: result.parsed_episode_numbers,
      isBatch,
      isSeaDex: result.is_seadex,
      isSeaDexBest: result.is_seadex_best,
      trusted: result.trusted,
    }),
    magnet: result.magnet,
    ...(episodeNumber === undefined ? {} : { episodeNumber }),
    ...(result.parsed_group === undefined ? {} : { group: result.parsed_group }),
    ...(result.info_hash === undefined ? {} : { infoHash: result.info_hash }),
    releaseMetadata: buildDownloadSourceMetadata({
      airDate: result.parsed_air_date,
      chosenFromSeaDex: selection.chosen_from_seadex,
      group: result.parsed_group,
      indexer: result.indexer,
      isSeaDex: result.is_seadex,
      isSeaDexBest: result.is_seadex_best,
      parsedTitle: result.title,
      quality: result.parsed_quality,
      remake: result.remake,
      resolution: result.parsed_resolution,
      seaDexComparison: result.seadex_comparison,
      seaDexDualAudio: result.seadex_dual_audio,
      seaDexNotes: result.seadex_notes,
      seaDexReleaseGroup: result.seadex_release_group,
      seaDexTags: result.seadex_tags,
      selectionKind: selection.selection_kind,
      sourceIdentity,
      sourceUrl: result.view_url,
      trusted: result.trusted,
    }),
    title: result.title,
    ...(isBatch ? { isBatch: true } : {}),
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
}) {
  const selection = selectionMetadataFromDownloadAction(input.result.download_action);
  const sourceIdentity = buildParsedEpisodeIdentity({
    parsedAirDate: input.result.parsed_air_date,
    parsedEpisodeLabel: input.result.parsed_episode_label,
    parsedEpisodeNumbers: input.result.parsed_episode_numbers,
  });

  return {
    animeId: input.animeId,
    decisionReason: decisionReasonFromEpisodeResult(input.result),
    episodeNumber: input.episodeNumber,
    title: input.result.title,
    magnet: input.result.link,
    ...(input.result.group === undefined ? {} : { group: input.result.group }),
    ...(input.result.info_hash === undefined ? {} : { infoHash: input.result.info_hash }),
    releaseMetadata: buildDownloadSourceMetadata({
      airDate: input.result.parsed_air_date,
      chosenFromSeaDex: selection.chosen_from_seadex,
      group: input.result.group,
      indexer: input.result.indexer,
      isSeaDex: input.result.is_seadex,
      isSeaDexBest: input.result.is_seadex_best,
      parsedTitle: input.result.title,
      previousQuality: selection.previous_quality,
      previousScore: selection.previous_score,
      remake: input.result.remake,
      resolution: input.result.parsed_resolution,
      seaDexComparison: input.result.seadex_comparison,
      seaDexDualAudio: input.result.seadex_dual_audio,
      seaDexNotes: input.result.seadex_notes,
      seaDexReleaseGroup: input.result.seadex_release_group,
      seaDexTags: input.result.seadex_tags,
      selectionKind: selection.selection_kind,
      selectionScore: selection.selection_score,
      sourceIdentity,
      sourceUrl: input.result.view_url,
      trusted: input.result.trusted,
    }),
  };
}

export function actionReasonFromDownloadAction(action: DownloadAction) {
  if (action.Reject) return action.Reject.reason;
  if (action.Upgrade) return action.Upgrade.reason;
  return null;
}
