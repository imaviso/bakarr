import { type NamingInput, renderEpisodeFilename } from "@/infra/naming.ts";
import type {
  DownloadSourceMetadata,
  ParsedUnitIdentity as SharedParsedEpisodeIdentity,
  PreferredTitle,
  RenamePreviewMetadataSnapshot,
} from "@packages/shared/index.ts";
import {
  getSourceIdentityAirDate,
  getSourceIdentitySeason,
  toSharedParsedEpisodeIdentity,
} from "@/infra/media/identity/identity.ts";
import type { ProbedMediaMetadata } from "@/infra/media/probe.ts";
import {
  buildEpisodeNamingInputFromPath,
  selectAnimeYearForNaming,
} from "@/features/operations/library/naming-metadata-support.ts";
import { resolveFilenameRenderPlan } from "@/features/operations/library/naming-format-support.ts";
import { selectAnimeTitleForNamingDetails } from "@/features/operations/library/naming-title-support.ts";
import type {
  CanonicalEpisodeNamingInput,
  EpisodeFilenamePlan,
} from "@/features/operations/library/naming-types.ts";

export function buildCanonicalEpisodeNamingInput(input: {
  animeStartDate?: string | null;
  animeEndDate?: string | null;
  animeStartYear?: number | null;
  animeEndYear?: number | null;
  mediaTitle: string;
  unitNumbers: readonly number[];
  filePath: string;
  rootFolder?: string;
  season?: number;
  episodeRows?: readonly { title?: string | null; aired?: string | null }[];
  downloadSourceMetadata?: DownloadSourceMetadata;
  localMediaMetadata?: ProbedMediaMetadata;
}): CanonicalEpisodeNamingInput {
  const warnings = deriveCanonicalInputWarnings(input.unitNumbers, input.episodeRows);
  const pathInput = buildEpisodeNamingInputFromPath({
    ...(input.animeStartDate === undefined ? {} : { animeStartDate: input.animeStartDate }),
    mediaTitle: input.mediaTitle,
    unitNumbers: input.unitNumbers,
    filePath: input.filePath,
    ...(input.rootFolder === undefined ? {} : { rootFolder: input.rootFolder }),
    ...(input.season === undefined ? {} : { season: input.season }),
  });

  const explicitAirDate = pickCanonicalAirDate(
    input.episodeRows ?? [],
    input.downloadSourceMetadata,
    pathInput.sourceIdentity,
  );
  const explicitEpisodeTitle = pickCanonicalEpisodeTitle(
    input.episodeRows,
    input.downloadSourceMetadata,
  );

  return {
    namingInput: {
      ...pathInput,
      airDate: explicitAirDate ?? pathInput.airDate,
      audioChannels:
        normalizeText(input.downloadSourceMetadata?.audio_channels) ??
        pathInput.audioChannels ??
        input.localMediaMetadata?.audio_channels,
      audioCodec:
        normalizeText(input.downloadSourceMetadata?.audio_codec) ??
        pathInput.audioCodec ??
        input.localMediaMetadata?.audio_codec,
      unitTitle: explicitEpisodeTitle ?? pathInput.unitTitle,
      group: normalizeText(input.downloadSourceMetadata?.group) ?? pathInput.group,
      quality: normalizeText(input.downloadSourceMetadata?.quality) ?? pathInput.quality,
      resolution:
        normalizeText(input.downloadSourceMetadata?.resolution) ??
        pathInput.resolution ??
        input.localMediaMetadata?.resolution,
      season: seasonFromMetadata(input.downloadSourceMetadata) ?? pathInput.season,
      sourceIdentity:
        sourceIdentityFromMetadata(input.downloadSourceMetadata) ?? pathInput.sourceIdentity,
      videoCodec:
        normalizeText(input.downloadSourceMetadata?.video_codec) ??
        pathInput.videoCodec ??
        input.localMediaMetadata?.video_codec,
      year: selectAnimeYearForNaming({
        ...(input.animeEndDate === undefined ? {} : { endDate: input.animeEndDate }),
        ...(input.animeEndYear === undefined ? {} : { endYear: input.animeEndYear }),
        ...(input.animeStartDate === undefined ? {} : { startDate: input.animeStartDate }),
        ...(input.animeStartYear === undefined ? {} : { startYear: input.animeStartYear }),
      }),
    },
    warnings,
  };
}

export function buildEpisodeFilenamePlan(input: {
  animeRow: {
    endDate?: string | null;
    endYear?: number | null;
    format: string;
    rootFolder?: string;
    startDate?: string | null;
    startYear?: number | null;
    titleEnglish?: string | null;
    titleNative?: string | null;
    titleRomaji: string;
  };
  unitNumbers: readonly number[];
  filePath: string;
  namingFormat: string;
  preferredTitle: PreferredTitle;
  season?: number;
  episodeRows?: readonly { title?: string | null; aired?: string | null }[];
  downloadSourceMetadata?: DownloadSourceMetadata;
  localMediaMetadata?: ProbedMediaMetadata;
}): EpisodeFilenamePlan {
  const titleSelection = selectAnimeTitleForNamingDetails(input.animeRow, input.preferredTitle);
  const canonical = buildCanonicalEpisodeNamingInput({
    ...(input.animeRow.endDate === undefined ? {} : { animeEndDate: input.animeRow.endDate }),
    ...(input.animeRow.endYear === undefined ? {} : { animeEndYear: input.animeRow.endYear }),
    ...(input.animeRow.startDate === undefined ? {} : { animeStartDate: input.animeRow.startDate }),
    ...(input.animeRow.startYear === undefined ? {} : { animeStartYear: input.animeRow.startYear }),
    mediaTitle: titleSelection.title,
    ...(input.downloadSourceMetadata === undefined
      ? {}
      : { downloadSourceMetadata: input.downloadSourceMetadata }),
    unitNumbers: input.unitNumbers,
    ...(input.episodeRows === undefined ? {} : { episodeRows: input.episodeRows }),
    filePath: input.filePath,
    ...(input.localMediaMetadata === undefined
      ? {}
      : { localMediaMetadata: input.localMediaMetadata }),
    ...(input.animeRow.rootFolder === undefined ? {} : { rootFolder: input.animeRow.rootFolder }),
    ...(input.season === undefined ? {} : { season: input.season }),
  });
  const renderPlan = resolveFilenameRenderPlan({
    animeFormat: input.animeRow.format,
    format: input.namingFormat,
    metadata: canonical.namingInput,
  });

  return {
    baseName: renderEpisodeFilename(renderPlan.formatUsed, canonical.namingInput),
    fallbackUsed: renderPlan.fallbackUsed,
    formatUsed: renderPlan.formatUsed,
    metadataSnapshot: toRenamePreviewMetadataSnapshot(canonical.namingInput, titleSelection.source),
    missingFields: renderPlan.missingFields,
    warnings: [...new Set([...canonical.warnings, ...renderPlan.warnings])],
  };
}

function deriveCanonicalInputWarnings(
  unitNumbers: readonly number[],
  episodeRows?: readonly { title?: string | null; aired?: string | null }[],
) {
  if (unitNumbers.length <= 1) {
    return [] as string[];
  }

  const warnings: string[] = [];

  if (hasMultipleDistinctTitles(episodeRows)) {
    warnings.push("Skipped {unit_title} because the file covers multiple mediaUnits");
  }
  if (hasMultipleDistinctAirDates(episodeRows)) {
    warnings.push("Skipped {air_date} because the file covers multiple mediaUnits");
  }

  return warnings;
}

function toRenamePreviewMetadataSnapshot(
  namingInput: NamingInput,
  titleSource: RenamePreviewMetadataSnapshot["title_source"],
): RenamePreviewMetadataSnapshot {
  return {
    air_date: namingInput.airDate,
    audio_channels: namingInput.audioChannels,
    audio_codec: namingInput.audioCodec,
    unit_title: namingInput.unitTitle,
    group: namingInput.group,
    quality: namingInput.quality,
    resolution: namingInput.resolution,
    season: namingInput.season,
    source_identity: toSharedParsedEpisodeIdentity(namingInput.sourceIdentity),
    title: namingInput.title,
    title_source: titleSource,
    video_codec: namingInput.videoCodec,
    year: namingInput.year,
  };
}

function pickCanonicalEpisodeTitle(
  episodeRows?: readonly { title?: string | null }[],
  downloadSourceMetadata?: DownloadSourceMetadata,
) {
  const distinctTitles = [
    ...new Set((episodeRows ?? []).map((row) => normalizeText(row.title)).filter(Boolean)),
  ];

  if (distinctTitles.length === 1) {
    return distinctTitles[0];
  }

  return normalizeText(downloadSourceMetadata?.unit_title);
}

function pickCanonicalAirDate(
  episodeRows: readonly { aired?: string | null }[],
  downloadSourceMetadata: DownloadSourceMetadata | undefined,
  sourceIdentity?: SharedParsedEpisodeIdentity,
) {
  const distinctDates = [
    ...new Set((episodeRows ?? []).map((row) => normalizeAirDate(row.aired)).filter(Boolean)),
  ];

  if (distinctDates.length === 1) {
    return distinctDates[0];
  }

  const sourceIdentityAirDate = getSourceIdentityAirDate(sourceIdentity);

  if (sourceIdentityAirDate) {
    return normalizeAirDate(sourceIdentityAirDate);
  }

  return normalizeAirDate(downloadSourceMetadata?.air_date);
}

function seasonFromMetadata(downloadSourceMetadata?: DownloadSourceMetadata) {
  const identity = sourceIdentityFromMetadata(downloadSourceMetadata);
  return getSourceIdentitySeason(identity);
}

function sourceIdentityFromMetadata(
  downloadSourceMetadata?: DownloadSourceMetadata,
): SharedParsedEpisodeIdentity | undefined {
  const identity = downloadSourceMetadata?.source_identity;

  if (!identity) {
    return undefined;
  }

  return toSharedParsedEpisodeIdentity(identity);
}

function hasMultipleDistinctTitles(episodeRows?: readonly { title?: string | null }[]) {
  return (
    new Set((episodeRows ?? []).map((row) => normalizeText(row.title)).filter(Boolean)).size > 1
  );
}

function hasMultipleDistinctAirDates(episodeRows?: readonly { aired?: string | null }[]) {
  return (
    new Set((episodeRows ?? []).map((row) => normalizeAirDate(row.aired)).filter(Boolean)).size > 1
  );
}

function normalizeText(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

function normalizeAirDate(value?: string | null) {
  const trimmed = normalizeText(value);

  if (!trimmed) {
    return undefined;
  }

  const match = trimmed.match(/^(\d{4}-\d{2}-\d{2})/);
  return match?.[1] ?? trimmed;
}
