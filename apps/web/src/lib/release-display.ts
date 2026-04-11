import type { DownloadAction, NyaaSearchResult } from "~/lib/api";
import {
  formatReleaseParsedSummary,
  formatReleaseSourceSummary,
  getReleaseFlags,
} from "~/lib/release-metadata";
import {
  formatSelectionDetail,
  formatSelectionSummary,
  selectionKindLabel,
  selectionMetadataFromDownloadAction,
  type CompactSelectionMetadata,
} from "~/lib/release-selection";
import { selectionMetadataFromNyaaResult } from "~/lib/release-grab";

interface ReleaseDisplayInput {
  group?: string | undefined;
  indexer?: string | undefined;
  is_seadex?: boolean | undefined;
  is_seadex_best?: boolean | undefined;
  parsed_air_date?: string | undefined;
  parsed_episode_label?: string | undefined;
  quality?: string | undefined;
  remake?: boolean | undefined;
  resolution?: string | undefined;
  seadex_dual_audio?: boolean | undefined;
  trusted?: boolean | undefined;
}

export function buildReleaseDisplay(input: ReleaseDisplayInput) {
  return {
    confidence: {
      is_seadex: input.is_seadex,
      is_seadex_best: input.is_seadex_best,
      remake: input.remake,
      trusted: input.trusted,
    },
    flags: getReleaseFlags({
      is_seadex: input.is_seadex,
      is_seadex_best: input.is_seadex_best,
      remake: input.remake,
      seadex_dual_audio: input.seadex_dual_audio,
      trusted: input.trusted,
    }),
    parsedSummary: formatReleaseParsedSummary({
      parsed_air_date: input.parsed_air_date,
      parsed_episode_label: input.parsed_episode_label,
    }),
    sourceSummary: formatReleaseSourceSummary({
      group: input.group,
      indexer: input.indexer,
      quality: input.quality,
      resolution: input.resolution,
    }),
  };
}

export function buildSelectionDisplay(selection: CompactSelectionMetadata) {
  return {
    detail: formatSelectionDetail(selection),
    label: selectionKindLabel(selection.selection_kind),
    metadata: selection,
    summary: formatSelectionSummary(selection),
  };
}

export function buildSelectionDisplayFromDownloadAction(action: DownloadAction) {
  return buildSelectionDisplay(selectionMetadataFromDownloadAction(action));
}

export function buildSelectionDisplayFromNyaaResult(result: NyaaSearchResult) {
  return buildSelectionDisplay(selectionMetadataFromNyaaResult(result));
}
