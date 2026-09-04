import type { DownloadAction, NyaaSearchResult } from "@/api/contracts";
import {
  formatReleaseParsedSummary,
  formatReleaseSourceSummary,
  getReleaseFlags,
} from "@/domain/release/metadata";
import {
  formatSelectionDetail,
  formatSelectionSummary,
  selectionKindLabel,
  selectionMetadataFromDownloadAction,
  type CompactSelectionMetadata,
} from "@/domain/release/selection";
import { selectionMetadataFromNyaaResult } from "@/domain/release/grab";

interface ReleaseDisplayInput {
  group?: string | null | undefined;
  indexer?: string | null | undefined;
  is_seadex?: boolean | null | undefined;
  is_seadex_best?: boolean | null | undefined;
  parsed_air_date?: string | null | undefined;
  parsed_unit_label?: string | null | undefined;
  quality?: string | null | undefined;
  remake?: boolean | null | undefined;
  resolution?: string | null | undefined;
  seadex_dual_audio?: boolean | null | undefined;
  trusted?: boolean | null | undefined;
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
      parsed_unit_label: input.parsed_unit_label,
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
