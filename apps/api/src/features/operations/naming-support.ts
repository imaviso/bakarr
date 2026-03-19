import { type NamingInput, renderEpisodeFilename } from "../../lib/naming.ts";
import type {
  DownloadAction,
  DownloadSourceMetadata,
  NamingTitleSource,
  ParsedEpisodeIdentity as SharedParsedEpisodeIdentity,
  PreferredTitle,
  RenamePreviewMetadataSnapshot,
} from "../../../../../packages/shared/src/index.ts";
import {
  buildPathParseContext,
  type ParsedEpisodeIdentity as LocalParsedEpisodeIdentity,
  parseFileSourceIdentity,
  parseReleaseSourceIdentity,
} from "../../lib/media-identity.ts";
import type { ProbedMediaMetadata } from "../../lib/media-probe.ts";

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

export interface ScannedFileMetadata {
  readonly air_date?: string;
  readonly audio_channels?: string;
  readonly audio_codec?: string;
  readonly duration_seconds?: number;
  readonly episode_title?: string;
  readonly quality?: string;
  readonly video_codec?: string;
  readonly warnings: readonly string[];
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
  const orderedTitles = preferredTitle === "english"
    ? [
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
    ]
    : preferredTitle === "native"
    ? [
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
    ]
    : [
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
    source: preferredTitle === "romaji"
      ? "preferred_romaji"
      : "fallback_romaji",
    title: animeRow.titleRomaji,
  };
}

export function selectNamingFormat(
  animeRow: { format: string },
  settings: { namingFormat: string; movieNamingFormat: string },
): string {
  return animeRow.format === "MOVIE"
    ? settings.movieNamingFormat
    : settings.namingFormat;
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
    warnings: missingFields.map((field) =>
      `Missing metadata for {${field}} token`
    ),
  };
}

export function resolveFilenameRenderPlan(input: {
  animeFormat: string;
  format: string;
  metadata: NamingInput;
}): ResolvedNamingPlan {
  const validation = validateNamingMetadata(input.format, input.metadata);
  const criticalMissingFields = validation.missingFields.filter((field) =>
    field === "season" || field === "episode" || field === "episode_segment"
  );

  if (criticalMissingFields.length === 0) {
    return {
      fallbackUsed: false,
      formatUsed: input.format,
      missingFields: validation.missingFields,
      warnings: validation.warnings,
    };
  }

  const fallbackFormat = input.animeFormat === "MOVIE"
    ? (input.metadata.year ? "{title} ({year})" : "{title}")
    : (input.metadata.sourceIdentity
      ? "{title} - {source_episode_segment}"
      : "{title} - {episode_segment}");

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

export function hasMissingLocalMediaNamingFields(
  missingFields: readonly string[],
) {
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
      warnings.push(
        "Skipped {episode_title} because the file covers multiple episodes",
      );
    }
    if (hasMultipleDistinctAirDates(input.episodeRows)) {
      warnings.push(
        "Skipped {air_date} because the file covers multiple episodes",
      );
    }
  }

  return {
    namingInput: {
      ...pathInput,
      airDate: explicitAirDate ?? pathInput.airDate,
      audioChannels:
        normalizeText(input.downloadSourceMetadata?.audio_channels) ??
          pathInput.audioChannels ?? input.localMediaMetadata?.audio_channels,
      audioCodec: normalizeText(input.downloadSourceMetadata?.audio_codec) ??
        pathInput.audioCodec ?? input.localMediaMetadata?.audio_codec,
      episodeTitle: explicitEpisodeTitle ?? pathInput.episodeTitle,
      group: normalizeText(input.downloadSourceMetadata?.group) ??
        pathInput.group,
      quality: normalizeText(input.downloadSourceMetadata?.quality) ??
        pathInput.quality,
      resolution: normalizeText(input.downloadSourceMetadata?.resolution) ??
        pathInput.resolution ?? input.localMediaMetadata?.resolution,
      season: seasonFromMetadata(input.downloadSourceMetadata) ??
        pathInput.season,
      sourceIdentity:
        sourceIdentityFromMetadata(input.downloadSourceMetadata) ??
          pathInput.sourceIdentity,
      videoCodec: normalizeText(input.downloadSourceMetadata?.video_codec) ??
        pathInput.videoCodec ?? input.localMediaMetadata?.video_codec,
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
  const titleSelection = selectAnimeTitleForNamingDetails(
    input.animeRow,
    input.preferredTitle,
  );
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
    baseName: renderEpisodeFilename(
      renderPlan.formatUsed,
      canonical.namingInput,
    ),
    fallbackUsed: renderPlan.fallbackUsed,
    formatUsed: renderPlan.formatUsed,
    metadataSnapshot: toRenamePreviewMetadataSnapshot(
      canonical.namingInput,
      titleSelection.source,
    ),
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

export function buildScannedFileMetadata(input: {
  filePath: string;
  group?: string;
  sourceIdentity?: SharedParsedEpisodeIdentity;
}): ScannedFileMetadata {
  const warnings: string[] = [];
  const multipleEpisodes = input.sourceIdentity?.scheme !== "daily" &&
    (input.sourceIdentity?.episode_numbers?.length ?? 0) > 1;
  const episodeTitle = input.sourceIdentity
    ? extractEpisodeTitleFromPath({
      filePath: input.filePath,
      group: input.group,
      sourceIdentity: input.sourceIdentity,
    })
    : undefined;

  if (multipleEpisodes && episodeTitle) {
    warnings.push(
      "Skipped {episode_title} because the file covers multiple episodes",
    );
  }

  if (input.sourceIdentity?.scheme === "daily") {
    warnings.push(
      "Parsed a daily air date; set the episode number before import",
    );
  }

  if (!input.sourceIdentity) {
    warnings.push("No reliable episode identity found in filename");
  }

  return {
    air_date: input.sourceIdentity?.scheme === "daily"
      ? normalizeAirDate(input.sourceIdentity.air_dates?.[0])
      : undefined,
    audio_channels: extractAudioChannels(input.filePath),
    audio_codec: extractAudioCodec(input.filePath),
    episode_title: multipleEpisodes ? undefined : episodeTitle,
    quality: extractQualitySourceLabel(input.filePath),
    video_codec: extractVideoCodec(input.filePath),
    warnings,
  };
}

export function buildDownloadSourceMetadataFromRelease(input: {
  title: string;
  group?: string;
  resolution?: string;
  decisionReason?: string;
  selectionKind?: DownloadSourceMetadata["selection_kind"];
  selectionScore?: number;
  previousQuality?: string;
  previousScore?: number;
  chosenFromSeadex?: boolean;
  trusted?: boolean;
  remake?: boolean;
  sourceUrl?: string;
  indexer?: string;
  isSeadex?: boolean;
  isSeadexBest?: boolean;
  seadexReleaseGroup?: string;
  seadexTags?: readonly string[];
  seadexNotes?: string;
  seadexComparison?: string;
  seadexDualAudio?: boolean;
}): DownloadSourceMetadata {
  const parsed = parseReleaseSourceIdentity(input.title);
  const sourceIdentity = cloneParsedEpisodeIdentity(parsed.source_identity);
  const group = normalizeText(input.group) ?? parsed.group;

  return {
    air_date: sourceIdentity?.scheme === "daily"
      ? normalizeAirDate(sourceIdentity.air_dates?.[0])
      : undefined,
    audio_channels: extractAudioChannels(input.title),
    audio_codec: extractAudioCodec(input.title),
    decision_reason: normalizeText(input.decisionReason),
    selection_kind: input.selectionKind,
    selection_score: normalizeFiniteNumber(input.selectionScore),
    previous_quality: normalizeText(input.previousQuality),
    previous_score: normalizeFiniteNumber(input.previousScore),
    chosen_from_seadex: input.chosenFromSeadex,
    episode_title: extractEpisodeTitleFromPath({
      filePath: input.title,
      group,
      sourceIdentity,
    }),
    group,
    indexer: normalizeText(input.indexer),
    is_seadex: input.isSeadex,
    is_seadex_best: input.isSeadexBest,
    parsed_title: normalizeText(parsed.parsed_title),
    quality: extractQualitySourceLabel(input.title),
    remake: input.remake,
    resolution: normalizeText(input.resolution) ?? parsed.resolution,
    seadex_comparison: normalizeText(input.seadexComparison),
    seadex_dual_audio: input.seadexDualAudio,
    seadex_notes: normalizeText(input.seadexNotes),
    seadex_release_group: normalizeText(input.seadexReleaseGroup),
    seadex_tags: input.seadexTags ? [...input.seadexTags] : undefined,
    source_identity: sourceIdentity,
    source_url: normalizeText(input.sourceUrl),
    trusted: input.trusted,
    video_codec: extractVideoCodec(input.title),
  };
}

export function mergeDownloadSourceMetadata(
  base: DownloadSourceMetadata,
  override?: DownloadSourceMetadata,
): DownloadSourceMetadata {
  if (!override) {
    return {
      ...base,
      seadex_tags: base.seadex_tags ? [...base.seadex_tags] : undefined,
      source_identity: cloneParsedEpisodeIdentity(base.source_identity),
    };
  }

  return {
    air_date: pickOverride(override.air_date, base.air_date),
    audio_channels: pickOverride(override.audio_channels, base.audio_channels),
    audio_codec: pickOverride(override.audio_codec, base.audio_codec),
    decision_reason: pickOverride(
      override.decision_reason,
      base.decision_reason,
    ),
    selection_kind: pickOverride(
      override.selection_kind,
      base.selection_kind,
    ),
    selection_score: pickOverride(
      override.selection_score,
      base.selection_score,
    ),
    previous_quality: pickOverride(
      override.previous_quality,
      base.previous_quality,
    ),
    previous_score: pickOverride(
      override.previous_score,
      base.previous_score,
    ),
    chosen_from_seadex: pickOverride(
      override.chosen_from_seadex,
      base.chosen_from_seadex,
    ),
    episode_title: pickOverride(override.episode_title, base.episode_title),
    group: pickOverride(override.group, base.group),
    indexer: pickOverride(override.indexer, base.indexer),
    is_seadex: pickOverride(override.is_seadex, base.is_seadex),
    is_seadex_best: pickOverride(override.is_seadex_best, base.is_seadex_best),
    parsed_title: pickOverride(override.parsed_title, base.parsed_title),
    quality: pickOverride(override.quality, base.quality),
    remake: pickOverride(override.remake, base.remake),
    resolution: pickOverride(override.resolution, base.resolution),
    seadex_comparison: pickOverride(
      override.seadex_comparison,
      base.seadex_comparison,
    ),
    seadex_dual_audio: pickOverride(
      override.seadex_dual_audio,
      base.seadex_dual_audio,
    ),
    seadex_notes: pickOverride(override.seadex_notes, base.seadex_notes),
    seadex_release_group: pickOverride(
      override.seadex_release_group,
      base.seadex_release_group,
    ),
    seadex_tags: override.seadex_tags
      ? [...override.seadex_tags]
      : base.seadex_tags
      ? [...base.seadex_tags]
      : undefined,
    source_identity: cloneParsedEpisodeIdentity(
      override.source_identity ?? base.source_identity,
    ),
    source_url: pickOverride(override.source_url, base.source_url),
    trusted: pickOverride(override.trusted, base.trusted),
    video_codec: pickOverride(override.video_codec, base.video_codec),
  };
}

export function buildEpisodeNamingInputFromPath(input: {
  animeStartDate?: string | null;
  animeTitle: string;
  airDate?: string | null;
  episodeNumbers: readonly number[];
  episodeTitle?: string | null;
  filePath: string;
  rootFolder?: string;
  season?: number;
}): NamingInput {
  const context = input.rootFolder &&
      input.filePath.replace(/\/+$/, "").startsWith(
        input.rootFolder.replace(/\/+$/, "") + "/",
      )
    ? buildPathParseContext(input.rootFolder, input.filePath)
    : undefined;
  const parsed = parseFileSourceIdentity(input.filePath, context);
  const sourceIdentity = parsed.source_identity;
  const group = parsed.group;

  return {
    airDate: normalizeAirDate(input.airDate),
    audioChannels: extractAudioChannels(input.filePath),
    audioCodec: extractAudioCodec(input.filePath),
    episodeNumbers: [...input.episodeNumbers],
    episodeTitle: normalizeText(input.episodeTitle) ??
      extractEpisodeTitleFromPath({
        filePath: input.filePath,
        group,
        sourceIdentity,
      }),
    group,
    quality: extractQualitySourceLabel(input.filePath),
    resolution: parsed.resolution,
    season: sourceIdentity?.scheme === "season"
      ? sourceIdentity.season
      : input.season,
    sourceIdentity,
    title: input.animeTitle,
    videoCodec: extractVideoCodec(input.filePath),
    year: extractYearFromIsoDate(input.animeStartDate),
  };
}

export function buildDownloadSelectionMetadata(
  action: DownloadAction | undefined,
): Pick<
  DownloadSourceMetadata,
  | "selection_kind"
  | "selection_score"
  | "previous_quality"
  | "previous_score"
  | "chosen_from_seadex"
> {
  if (action?.Upgrade) {
    return {
      chosen_from_seadex: action.Upgrade.is_seadex || undefined,
      previous_quality: action.Upgrade.old_quality.name,
      previous_score: normalizeFiniteNumber(action.Upgrade.old_score),
      selection_kind: "upgrade",
      selection_score: normalizeFiniteNumber(action.Upgrade.score),
    };
  }

  if (action?.Accept) {
    return {
      chosen_from_seadex: action.Accept.is_seadex || undefined,
      selection_kind: "accept",
      selection_score: normalizeFiniteNumber(action.Accept.score),
    };
  }

  return {};
}

function pickCanonicalEpisodeTitle(
  episodeRows?: readonly { title?: string | null }[],
  downloadSourceMetadata?: DownloadSourceMetadata,
) {
  const distinctTitles = [
    ...new Set(
      (episodeRows ?? []).map((row) => normalizeText(row.title)).filter(
        Boolean,
      ),
    ),
  ];

  if (distinctTitles.length === 1) {
    return distinctTitles[0];
  }

  return normalizeText(downloadSourceMetadata?.episode_title);
}

export function selectAnimeYearForNaming(input: {
  startYear?: number | null;
  startDate?: string | null;
  endYear?: number | null;
  endDate?: string | null;
}) {
  return input.startYear ?? extractYearFromIsoDate(input.startDate) ??
    input.endYear ?? extractYearFromIsoDate(input.endDate);
}

function pickCanonicalAirDate(
  episodeRows: readonly { aired?: string | null }[] | undefined,
  downloadSourceMetadata: DownloadSourceMetadata | undefined,
  sourceIdentity?: SharedParsedEpisodeIdentity,
) {
  const distinctDates = [
    ...new Set(
      (episodeRows ?? []).map((row) => normalizeAirDate(row.aired)).filter(
        Boolean,
      ),
    ),
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

function hasMultipleDistinctTitles(
  episodeRows?: readonly { title?: string | null }[],
) {
  return new Set(
    (episodeRows ?? []).map((row) => normalizeText(row.title)).filter(Boolean),
  ).size > 1;
}

function hasMultipleDistinctAirDates(
  episodeRows?: readonly { aired?: string | null }[],
) {
  return new Set(
    (episodeRows ?? []).map((row) => normalizeAirDate(row.aired)).filter(
      Boolean,
    ),
  ).size > 1;
}

function cloneParsedEpisodeIdentity(
  identity?:
    | DownloadSourceMetadata["source_identity"]
    | LocalParsedEpisodeIdentity,
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

function pickOverride<T>(
  override: T | undefined,
  base: T | undefined,
): T | undefined {
  return override !== undefined ? override : base;
}

function normalizeFiniteNumber(value: number | undefined) {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function extractEpisodeTitleFromPath(input: {
  filePath: string;
  group?: string;
  sourceIdentity?: SharedParsedEpisodeIdentity;
}) {
  if (!input.sourceIdentity) {
    return undefined;
  }

  const extensionless = stripExtension(basename(input.filePath)).replace(
    /^\[[^\]]+\]\s*/,
    "",
  );
  const labelIndex = extensionless.toLowerCase().indexOf(
    input.sourceIdentity.label.toLowerCase(),
  );

  if (labelIndex < 0) {
    return undefined;
  }

  let remainder = extensionless.slice(
    labelIndex + input.sourceIdentity.label.length,
  )
    .replace(/^[\s._-]+/, "")
    .trim();

  if (/\[[^\]]+\]/.test(remainder)) {
    remainder = remainder.replace(/\s*-\s*([^\s\[\]]+)\s*$/, "");
  }

  while (true) {
    const bracketMatch = remainder.match(/\s*-?\s*\[([^\]]+)\]\s*$/);
    if (!bracketMatch) {
      break;
    }

    const content = bracketMatch[1].trim();
    if (
      looksLikeMetadataTag(content) ||
      (input.group && content.toLowerCase() === input.group.toLowerCase())
    ) {
      remainder = remainder.slice(0, bracketMatch.index).trimEnd();
      continue;
    }

    break;
  }

  if (input.group) {
    remainder = remainder.replace(
      new RegExp(`\\s*-\\s*${escapeRegex(input.group)}\\s*$`, "i"),
      "",
    );
  }

  remainder = remainder
    .replace(/\s*[-_]+\s*$/g, "")
    .replace(/[._]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return remainder.length > 0 ? remainder : undefined;
}

function extractQualitySourceLabel(value: string) {
  const lower = value.toLowerCase();

  if (lower.includes("remux") || lower.includes("bdremux")) {
    return "BluRay Remux";
  }
  if (
    lower.includes("bluray") || lower.includes("blu-ray") ||
    lower.includes("bdrip") || lower.includes("bdmv") ||
    /(?:^|[\s._\-\[\]])bd(?:$|[\s._\-\[\]])/i.test(value)
  ) {
    return "BluRay";
  }
  if (lower.includes("webrip")) {
    return "WEBRip";
  }
  if (
    lower.includes("web-dl") || lower.includes("webdl") ||
    /\bamzn\b/i.test(value) || lower.includes("amazon") ||
    lower.includes("crunchyroll") || /\bcr\b/i.test(value) ||
    /\bdsnp\b/i.test(value) || lower.includes("disney") ||
    /\bnf\b/i.test(value) || lower.includes("netflix") ||
    /\bhmax\b/i.test(value) || lower.includes("hulu")
  ) {
    return "WEB-DL";
  }
  if (/(?:^|[\s._\-\[\]])web(?:$|[\s._\-\[\]])/i.test(value)) {
    return "WEB";
  }
  if (lower.includes("hdtv")) {
    return "HDTV";
  }
  if (lower.includes("dvd")) {
    return "DVD";
  }
  if (lower.includes("sdtv")) {
    return "SDTV";
  }

  return undefined;
}

function extractVideoCodec(value: string) {
  const match = value.match(
    /\b(x265|hevc|h[ .-]?265|x264|avc|h[ .-]?264|av1|vp9)\b/i,
  );

  if (!match) {
    return undefined;
  }

  const codec = match[1].toLowerCase().replace(/[ .-]/g, "");

  switch (codec) {
    case "x265":
      return "x265";
    case "hevc":
      return "HEVC";
    case "h265":
      return "H.265";
    case "x264":
      return "x264";
    case "avc":
      return "AVC";
    case "h264":
      return "H.264";
    case "av1":
      return "AV1";
    case "vp9":
      return "VP9";
    default:
      return match[1];
  }
}

function extractAudioCodec(value: string) {
  const match = value.match(
    /\b(truehd|eac3|ddp|ac3|dts(?:-hd)?|flac|opus|aac)\b/i,
  );

  if (!match) {
    return undefined;
  }

  const codec = match[1].toLowerCase();

  switch (codec) {
    case "eac3":
      return "EAC3";
    case "ddp":
      return "DDP";
    case "truehd":
      return "TrueHD";
    case "ac3":
      return "AC3";
    case "dts-hd":
      return "DTS-HD";
    case "dts":
      return "DTS";
    case "flac":
      return "FLAC";
    case "opus":
      return "Opus";
    case "aac":
      return "AAC";
    default:
      return match[1];
  }
}

function extractAudioChannels(value: string) {
  const match = value.match(
    /\b(?:aac|flac|opus|ac3|eac3|ddp|truehd|dts(?:-hd)?)\s*([1-9]\.\d)\b/i,
  ) ?? value.match(/\b([1-9]\.\d)\b/);

  if (match?.[1]) {
    return match[1];
  }

  const channelCountMatch = value.match(/\b(1|2|6|8)\s*ch\b/i);
  switch (channelCountMatch?.[1]) {
    case "1":
      return "1.0";
    case "2":
      return "2.0";
    case "6":
      return "5.1";
    case "8":
      return "7.1";
    default:
      return undefined;
  }
}

function extractYearFromIsoDate(value?: string | null) {
  if (!value) {
    return undefined;
  }

  const match = value.match(/^(\d{4})/);
  return match ? Number(match[1]) : undefined;
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

function basename(value: string) {
  return value.split("/").pop() ?? value;
}

function stripExtension(value: string) {
  return value.replace(/\.[^.]+$/, "");
}

const METADATA_TAG_PATTERNS: readonly RegExp[] = [
  /\b\d{3,4}p\b/i,
  /\b\d{3,4}x\d{3,4}\b/i,
  /\bv\d+\b/i,
  /\b(?:web(?:[ .-]?dl)?|webdl|webrip|bluray|blu-ray|bdrip|bdremux|bdmv|bd|remux|hdtv|dvd|sdtv)\b/i,
  /\b(?:x264|x265|h[ .-]?264|h[ .-]?265|hevc|avc|av1|vp9)\b/i,
  /\b(?:aac|flac|opus|ac3|eac3|ddp|truehd|dts(?:-hd)?)(?:[ .-]?\d(?:[ .]?\d))?\b/i,
  /\b(?:1|2|6|8)\s*ch\b/i,
  /\b(?:dual(?:[ .-]?audio)?|multi(?:[ .-]?audio)?|proper|repack|complete|batch)\b/i,
];

function looksLikeMetadataTag(value: string): boolean {
  const lower = value.trim().toLowerCase();

  if (lower.length === 0) {
    return true;
  }

  return METADATA_TAG_PATTERNS.some((pattern) => pattern.test(lower));
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
