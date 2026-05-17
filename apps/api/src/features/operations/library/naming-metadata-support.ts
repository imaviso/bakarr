import type { NamingInput } from "@/infra/naming.ts";
import type { DownloadAction, DownloadSourceMetadata } from "@packages/shared/index.ts";
import {
  buildPathParseContext,
  parseFileSourceIdentity,
  parseReleaseSourceIdentity,
  toSharedParsedEpisodeIdentity,
} from "@/infra/media/identity/identity.ts";
import { extractYearFromDate } from "@/domain/media/date-utils.ts";
import {
  extractAudioChannels,
  extractAudioCodec,
  extractEpisodeTitleFromPath,
  extractQualitySourceLabel,
  extractVideoCodec,
  normalizeAirDate,
  normalizeText,
} from "@/infra/scanned-file-metadata.ts";

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
  const sourceIdentity = toSharedParsedEpisodeIdentity(parsed.source_identity);
  const group = normalizeText(input.group) ?? parsed.group;

  return {
    air_date:
      sourceIdentity?.scheme === "daily"
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
    unit_title: extractEpisodeTitleFromPath({
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
  const seadexTags = override?.seadex_tags ?? base.seadex_tags;

  if (!override) {
    return {
      ...base,
      seadex_tags: base.seadex_tags ? [...base.seadex_tags] : undefined,
      source_identity: toSharedParsedEpisodeIdentity(base.source_identity),
    };
  }

  return {
    air_date: pickOverride(override.air_date, base.air_date),
    audio_channels: pickOverride(override.audio_channels, base.audio_channels),
    audio_codec: pickOverride(override.audio_codec, base.audio_codec),
    decision_reason: pickOverride(override.decision_reason, base.decision_reason),
    selection_kind: pickOverride(override.selection_kind, base.selection_kind),
    selection_score: pickOverride(override.selection_score, base.selection_score),
    previous_quality: pickOverride(override.previous_quality, base.previous_quality),
    previous_score: pickOverride(override.previous_score, base.previous_score),
    chosen_from_seadex: pickOverride(override.chosen_from_seadex, base.chosen_from_seadex),
    unit_title: pickOverride(override.unit_title, base.unit_title),
    group: pickOverride(override.group, base.group),
    indexer: pickOverride(override.indexer, base.indexer),
    is_seadex: pickOverride(override.is_seadex, base.is_seadex),
    is_seadex_best: pickOverride(override.is_seadex_best, base.is_seadex_best),
    parsed_title: pickOverride(override.parsed_title, base.parsed_title),
    quality: pickOverride(override.quality, base.quality),
    remake: pickOverride(override.remake, base.remake),
    resolution: pickOverride(override.resolution, base.resolution),
    seadex_comparison: pickOverride(override.seadex_comparison, base.seadex_comparison),
    seadex_dual_audio: pickOverride(override.seadex_dual_audio, base.seadex_dual_audio),
    seadex_notes: pickOverride(override.seadex_notes, base.seadex_notes),
    seadex_release_group: pickOverride(override.seadex_release_group, base.seadex_release_group),
    seadex_tags: seadexTags ? [...seadexTags] : undefined,
    source_identity: toSharedParsedEpisodeIdentity(
      override.source_identity ?? base.source_identity,
    ),
    source_url: pickOverride(override.source_url, base.source_url),
    trusted: pickOverride(override.trusted, base.trusted),
    video_codec: pickOverride(override.video_codec, base.video_codec),
  };
}

export function buildEpisodeNamingInputFromPath(input: {
  animeStartDate?: string | null;
  mediaTitle: string;
  airDate?: string | null;
  unitNumbers: readonly number[];
  unitTitle?: string | null;
  filePath: string;
  rootFolder?: string;
  season?: number;
}): NamingInput {
  const context =
    input.rootFolder &&
    input.filePath.replace(/\/+$/, "").startsWith(input.rootFolder.replace(/\/+$/, "") + "/")
      ? buildPathParseContext(input.rootFolder, input.filePath)
      : undefined;
  const parsed = parseFileSourceIdentity(input.filePath, context);
  const sourceIdentity = parsed.source_identity;
  const sourceIdentityDto = toSharedParsedEpisodeIdentity(sourceIdentity);
  const { group } = parsed;

  return {
    airDate: normalizeAirDate(input.airDate),
    audioChannels: extractAudioChannels(input.filePath),
    audioCodec: extractAudioCodec(input.filePath),
    unitNumbers: [...input.unitNumbers],
    unitTitle:
      normalizeText(input.unitTitle) ??
      extractEpisodeTitleFromPath({
        filePath: input.filePath,
        group,
        sourceIdentity: sourceIdentityDto,
      }),
    group,
    quality: extractQualitySourceLabel(input.filePath),
    resolution: parsed.resolution,
    season: sourceIdentity?.scheme === "season" ? sourceIdentity.season : input.season,
    sourceIdentity: sourceIdentityDto,
    title: input.mediaTitle,
    videoCodec: extractVideoCodec(input.filePath),
    year: extractYearFromDate(input.animeStartDate),
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

export function selectAnimeYearForNaming(input: {
  startYear?: number | null;
  startDate?: string | null;
  endYear?: number | null;
  endDate?: string | null;
}) {
  return (
    input.startYear ??
    extractYearFromDate(input.startDate) ??
    input.endYear ??
    extractYearFromDate(input.endDate)
  );
}

function pickOverride<T>(override: T | undefined, base: T | undefined): T | undefined {
  return override !== undefined ? override : base;
}

function normalizeFiniteNumber(value: number | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
