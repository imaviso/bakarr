import { type NamingInput, renderEpisodeFilename } from "../../lib/naming.ts";
import type {
  DownloadSourceMetadata,
  NamingTitleSource,
  ParsedEpisodeIdentity as SharedParsedEpisodeIdentity,
  PreferredTitle,
  RenamePreviewMetadataSnapshot,
} from "../../../../../packages/shared/src/index.ts";
import type { ParsedEpisodeIdentity as LocalParsedEpisodeIdentity } from "../../lib/media-identity.ts";
import type { ProbedMediaMetadata } from "../../lib/media-probe.ts";
import {
  buildEpisodeNamingInputFromPath,
  selectAnimeYearForNaming,
} from "./naming-metadata-support.ts";
export {
  buildDownloadSelectionMetadata,
  buildDownloadSourceMetadataFromRelease,
  buildEpisodeNamingInputFromPath,
  buildScannedFileMetadata,
  mergeDownloadSourceMetadata,
  selectAnimeYearForNaming,
} from "./naming-metadata-support.ts";
export type { ScannedFileMetadata } from "./naming-metadata-support.ts";

export interface ResolvedNamingPlan {
  readonly formatUsed: string;
  readonly fallbackUsed: boolean;
  readonly warnings: readonly string[];
  readonly missingFields: readonly string[];
}

export interface CanonicalEpisodeNamingInput {
  readonly namingInput: NamingInput;
  readonly warnings: readonly string[];
}

export interface EpisodeFilenamePlan {
  readonly baseName: string;
  readonly fallbackUsed: boolean;
  readonly formatUsed: string;
  readonly metadataSnapshot: RenamePreviewMetadataSnapshot;
  readonly missingFields: readonly string[];
  readonly warnings: readonly string[];
}

export interface SelectedAnimeTitleForNaming {
  readonly title: string;
  readonly source: NamingTitleSource;
}

const TOKEN_FIELD_MAP = {
  air_date: "airDate",
  audio_channels: "audioChannels",
  audio_codec: "audioCodec",
  episode: "episodeNumbers",
  episode_segment: "episodeNumbers",
  episode_title: "episodeTitle",
  group: "group",
  quality: "quality",
  resolution: "resolution",
  season: "season",
  source_episode_segment: "sourceIdentity",
  title: "title",
  video_codec: "videoCodec",
  year: "year",
} as const satisfies Record<string, keyof NamingInput>;

type NamingToken = keyof typeof TOKEN_FIELD_MAP;

const PROBEABLE_NAMING_FIELDS = new Set<string>([
  "audio_channels",
  "audio_codec",
  "resolution",
  "video_codec",
]);

export function selectAnimeTitleForNaming(
  animeRow: {
    titleRomaji: string;
    titleEnglish?: string | null;
    titleNative?: string | null;
  },
  preferredTitle: PreferredTitle,
): string {
  return selectAnimeTitleForNamingDetails(animeRow, preferredTitle).title;
}

export function selectAnimeTitleForNamingDetails(
  animeRow: {
    titleRomaji: string;
    titleEnglish?: string | null;
    titleNative?: string | null;
  },
  preferredTitle: PreferredTitle,
): SelectedAnimeTitleForNaming {
  let orderedTitles;

  if (preferredTitle === "english") {
    orderedTitles = [
      {
        source: "preferred_english" as const,
        value: animeRow.titleEnglish,
      },
      {
        source: "fallback_romaji" as const,
        value: animeRow.titleRomaji,
      },
      {
        source: "fallback_native" as const,
        value: animeRow.titleNative,
      },
    ];
  } else if (preferredTitle === "native") {
    orderedTitles = [
      {
        source: "preferred_native" as const,
        value: animeRow.titleNative,
      },
      {
        source: "fallback_romaji" as const,
        value: animeRow.titleRomaji,
      },
      {
        source: "fallback_english" as const,
        value: animeRow.titleEnglish,
      },
    ];
  } else {
    orderedTitles = [
      {
        source: "preferred_romaji" as const,
        value: animeRow.titleRomaji,
      },
      {
        source: "fallback_english" as const,
        value: animeRow.titleEnglish,
      },
      {
        source: "fallback_native" as const,
        value: animeRow.titleNative,
      },
    ];
  }

  for (const entry of orderedTitles) {
    const value = normalizeText(entry.value);
    if (value !== undefined) {
      return {
        source: entry.source,
        title: value,
      };
    }
  }

  return {
    source: preferredTitle === "romaji" ? "preferred_romaji" : "fallback_romaji",
    title: animeRow.titleRomaji,
  };
}

export function selectNamingFormat(
  animeRow: { format: string },
  settings: { namingFormat: string; movieNamingFormat: string },
): string {
  return animeRow.format === "MOVIE" ? settings.movieNamingFormat : settings.namingFormat;
}

export function inspectNamingFormat(format: string): readonly NamingToken[] {
  const tokens = new Set<NamingToken>();

  for (const match of format.matchAll(/\{([a-z_]+)(?::\d+)?\}/g)) {
    const token = match[1] as NamingToken;
    if (token in TOKEN_FIELD_MAP) {
      tokens.add(token);
    }
  }

  return [...tokens];
}

export function validateNamingMetadata(
  format: string,
  metadata: NamingInput,
): { missingFields: readonly string[]; warnings: readonly string[] } {
  const missingFields = inspectNamingFormat(format)
    .filter((token) => {
      const field = TOKEN_FIELD_MAP[token];
      const value = metadata[field];

      if (field === "episodeNumbers") {
        return !Array.isArray(value) || value.length === 0;
      }

      return value === undefined || value === null || value === "";
    })
    .map((token) => token);

  return {
    missingFields,
    warnings: missingFields.map((field) => `Missing metadata for {${field}} token`),
  };
}

export function resolveFilenameRenderPlan(input: {
  animeFormat: string;
  format: string;
  metadata: NamingInput;
}): ResolvedNamingPlan {
  const validation = validateNamingMetadata(input.format, input.metadata);
  const criticalMissingFields = validation.missingFields.filter(
    (field) => field === "season" || field === "episode" || field === "episode_segment",
  );

  if (criticalMissingFields.length === 0) {
    return {
      fallbackUsed: false,
      formatUsed: input.format,
      missingFields: validation.missingFields,
      warnings: validation.warnings,
    };
  }

  let fallbackFormat: string;

  if (input.animeFormat === "MOVIE") {
    fallbackFormat = input.metadata.year ? "{title} ({year})" : "{title}";
  } else {
    fallbackFormat = input.metadata.sourceIdentity
      ? "{title} - {source_episode_segment}"
      : "{title} - {episode_segment}";
  }

  return {
    fallbackUsed: true,
    formatUsed: fallbackFormat,
    missingFields: validation.missingFields,
    warnings: [
      ...validation.warnings,
      `Used safe fallback naming format instead of configured format`,
    ],
  };
}

export function hasMissingLocalMediaNamingFields(missingFields: readonly string[]) {
  return missingFields.some((field) => PROBEABLE_NAMING_FIELDS.has(field));
}

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
  const warnings: string[] = [];
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

  if (input.episodeNumbers.length > 1) {
    if (hasMultipleDistinctTitles(input.episodeRows)) {
      warnings.push("Skipped {episode_title} because the file covers multiple episodes");
    }
    if (hasMultipleDistinctAirDates(input.episodeRows)) {
      warnings.push("Skipped {air_date} because the file covers multiple episodes");
    }
  }

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

function toRenamePreviewMetadataSnapshot(
  namingInput: NamingInput,
  titleSource: NamingTitleSource,
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
    source_identity: cloneParsedEpisodeIdentity(namingInput.sourceIdentity),
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

  if (sourceIdentity?.scheme === "daily") {
    return normalizeAirDate(sourceIdentity.air_dates?.[0]);
  }

  return normalizeAirDate(downloadSourceMetadata?.air_date);
}

function seasonFromMetadata(downloadSourceMetadata?: DownloadSourceMetadata) {
  const identity = sourceIdentityFromMetadata(downloadSourceMetadata);
  return identity?.scheme === "season" ? identity.season : undefined;
}

function sourceIdentityFromMetadata(
  downloadSourceMetadata?: DownloadSourceMetadata,
): SharedParsedEpisodeIdentity | undefined {
  const identity = downloadSourceMetadata?.source_identity;

  if (!identity) {
    return undefined;
  }

  return cloneParsedEpisodeIdentity(identity);
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

function cloneParsedEpisodeIdentity(
  identity?: DownloadSourceMetadata["source_identity"] | LocalParsedEpisodeIdentity,
): SharedParsedEpisodeIdentity | undefined {
  if (!identity) {
    return undefined;
  }

  switch (identity.scheme) {
    case "season":
      return {
        episode_numbers: [...(identity.episode_numbers ?? [])],
        label: identity.label,
        scheme: "season",
        season: identity.season,
      };
    case "absolute":
      return {
        episode_numbers: [...(identity.episode_numbers ?? [])],
        label: identity.label,
        scheme: "absolute",
      };
    case "daily":
      return {
        air_dates: [...(identity.air_dates ?? [])],
        label: identity.label,
        scheme: "daily",
      };
  }
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
