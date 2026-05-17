import type { DownloadSourceMetadata, ParsedUnitIdentity } from "~/api/contracts";

interface ParsedIdentityInput {
  parsedAirDate?: string | undefined;
  parsedEpisodeLabel?: string | undefined;
  parsedEpisodeNumbers?: number[] | undefined;
}

export function buildParsedEpisodeIdentity(
  input: ParsedIdentityInput,
): ParsedUnitIdentity | undefined {
  if (!input.parsedEpisodeLabel) {
    return undefined;
  }

  if (input.parsedAirDate) {
    return {
      air_dates: [input.parsedAirDate],
      label: input.parsedEpisodeLabel,
      scheme: "daily",
    };
  }

  if (input.parsedEpisodeNumbers?.length) {
    return {
      unit_numbers: input.parsedEpisodeNumbers,
      label: input.parsedEpisodeLabel,
      scheme: "absolute",
    };
  }

  return undefined;
}

interface DownloadSourceMetadataInput {
  parsedTitle: string;
  selectionKind: NonNullable<DownloadSourceMetadata["selection_kind"]>;
  sourceIdentity?: ParsedUnitIdentity | undefined;
  airDate?: string | undefined;
  chosenFromSeaDex?: boolean | undefined;
  group?: string | undefined;
  indexer?: string | undefined;
  isSeaDex?: boolean | undefined;
  isSeaDexBest?: boolean | undefined;
  previousQuality?: string | undefined;
  previousScore?: number | undefined;
  quality?: string | undefined;
  remake?: boolean | undefined;
  resolution?: string | undefined;
  seaDexComparison?: string | undefined;
  seaDexDualAudio?: boolean | undefined;
  seaDexNotes?: string | undefined;
  seaDexReleaseGroup?: string | undefined;
  seaDexTags?: string[] | undefined;
  selectionScore?: number | undefined;
  sourceUrl?: string | undefined;
  trusted?: boolean | undefined;
}

export function buildDownloadSourceMetadata(
  input: DownloadSourceMetadataInput,
): DownloadSourceMetadata {
  const metadata: DownloadSourceMetadata = {
    parsed_title: input.parsedTitle,
    selection_kind: input.selectionKind,
  };

  addDefined(metadata, "air_date", input.airDate);
  addDefined(metadata, "chosen_from_seadex", input.chosenFromSeaDex);
  addDefined(metadata, "group", input.group);
  addDefined(metadata, "indexer", input.indexer);
  addDefined(metadata, "is_seadex", input.isSeaDex);
  addDefined(metadata, "is_seadex_best", input.isSeaDexBest);
  addDefined(metadata, "previous_quality", input.previousQuality);
  addDefined(metadata, "previous_score", input.previousScore);
  addDefined(metadata, "quality", input.quality);
  addDefined(metadata, "remake", input.remake);
  addDefined(metadata, "resolution", input.resolution);
  addDefined(metadata, "seadex_comparison", input.seaDexComparison);
  addDefined(metadata, "seadex_dual_audio", input.seaDexDualAudio);
  addDefined(metadata, "seadex_notes", input.seaDexNotes);
  addDefined(metadata, "seadex_release_group", input.seaDexReleaseGroup);
  addDefined(metadata, "seadex_tags", input.seaDexTags);
  addDefined(metadata, "selection_score", input.selectionScore);
  addDefined(metadata, "source_identity", input.sourceIdentity);
  addDefined(metadata, "source_url", input.sourceUrl);
  addDefined(metadata, "trusted", input.trusted);

  return metadata;
}

function addDefined<K extends keyof DownloadSourceMetadata>(
  metadata: DownloadSourceMetadata,
  key: K,
  value: DownloadSourceMetadata[K] | undefined,
) {
  if (value !== undefined) {
    metadata[key] = value;
  }
}
