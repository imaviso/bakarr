import { type NamingInput, renderEpisodeFilename } from "@/lib/naming.ts";
import type {
  DownloadSourceMetadata,
  ParsedEpisodeIdentity as SharedParsedEpisodeIdentity,
  PreferredTitle,
  RenamePreviewMetadataSnapshot,
} from "@packages/shared/index.ts";
import {
  getSourceIdentityAirDate,
  getSourceIdentitySeason,
  toSharedParsedEpisodeIdentity,
} from "@/lib/media-identity.ts";
import type { ProbedMediaMetadata } from "@/lib/media-probe.ts";
import {
  buildEpisodeNamingInputFromPath,
  selectAnimeYearForNaming,
} from "@/features/operations/naming-metadata-support.ts";
import { resolveFilenameRenderPlan } from "@/features/operations/naming-format-support.ts";
import { selectAnimeTitleForNamingDetails } from "@/features/operations/naming-title-support.ts";
import type {
  CanonicalEpisodeNamingInput,
  EpisodeFilenamePlan,
} from "@/features/operations/naming-types.ts";

export function buildCanonicalEpisodeNamingInput(input: {
  animeStartDate?: string | null;
  animeEndDate?: string | null;
  animeStartYear?: number | null;
  animeEndYear?: number | null;
  animeTitle: string;
  episodeNumbers: readonly number[];
  filePath: string;
  rootFolder?: string;
  season?: number;
  episodeRows?: readonly { title?: string | null; aired?: string | null }[];
  downloadSourceMetadata?: DownloadSourceMetadata;
  localMediaMetadata?: ProbedMediaMetadata;
}): CanonicalEpisodeNamingInput {
  const warnings = deriveCanonicalInputWarnings(input.episodeNumbers, input.episodeRows);
  const pathInput = buildEpisodeNamingInputFromPath({
    animeStartDate: input.animeStartDate,
    animeTitle: input.animeTitle,
    episodeNumbers: input.episodeNumbers,
    filePath: input.filePath,
    rootFolder: input.rootFolder,
    season: input.season,
  });

  const explicitAirDate = pickCanonicalAirDate(
    input.episodeRows,
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
      episodeTitle: explicitEpisodeTitle ?? pathInput.episodeTitle,
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
        endDate: input.animeEndDate,
        endYear: input.animeEndYear,
        startDate: input.animeStartDate,
        startYear: input.animeStartYear,
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
  episodeNumbers: readonly number[];
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
    animeEndDate: input.animeRow.endDate,
    animeEndYear: input.animeRow.endYear,
    animeStartDate: input.animeRow.startDate,
    animeStartYear: input.animeRow.startYear,
    animeTitle: titleSelection.title,
    downloadSourceMetadata: input.downloadSourceMetadata,
    episodeNumbers: input.episodeNumbers,
    episodeRows: input.episodeRows,
    filePath: input.filePath,
    localMediaMetadata: input.localMediaMetadata,
    rootFolder: input.animeRow.rootFolder,
    season: input.season,
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
  episodeNumbers: readonly number[],
  episodeRows?: readonly { title?: string | null; aired?: string | null }[],
) {
  if (episodeNumbers.length <= 1) {
    return [] as string[];
  }

  const warnings: string[] = [];

  if (hasMultipleDistinctTitles(episodeRows)) {
    warnings.push("Skipped {episode_title} because the file covers multiple episodes");
  }
  if (hasMultipleDistinctAirDates(episodeRows)) {
    warnings.push("Skipped {air_date} because the file covers multiple episodes");
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
    episode_title: namingInput.episodeTitle,
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

  return normalizeText(downloadSourceMetadata?.episode_title);
}

function pickCanonicalAirDate(
  episodeRows: readonly { aired?: string | null }[] | undefined,
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
