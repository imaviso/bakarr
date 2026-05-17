/**
 * Config-backed naming renderer for media-unit filenames.
 *
 * Supported placeholders:
 * - {title}              - Media title (sanitized for filesystem)
 * - {unit}               - Primary unit number (zero-padded to 2 digits)
 * - {unit:02}            - Primary unit number (zero-padded to 2 digits)
 * - {unit:03}            - Primary unit number (zero-padded to 3 digits)
 * - {episode}            - Alias for {unit}, kept for existing formats
 * - {episode:02}         - Alias for {unit:02}, kept for existing formats
 * - {episode:03}         - Alias for {unit:03}, kept for existing formats
 * - {unit_segment}       - Entry-local numbering: "03", "03-04", "014"
 * - {episode_segment}    - Alias for {unit_segment}, kept for existing formats
 * - {unit_title}         - Media unit title (sanitized for filesystem)
 * - {air_date}           - Air date in YYYY-MM-DD format (if available)
 * - {source_unit_segment} - Source label: "S02E03", "S01E01-E02", "2025-03-14"
 * - {source_episode_segment} - Alias for {source_unit_segment}, kept for existing formats
 * - {season}             - Season number (zero-padded to 2 digits)
 * - {season:02}          - Season number (zero-padded to 2 digits)
 * - {year}               - Release year (e.g. "2012")
 * - {group}              - Release group name
 * - {resolution}         - Video resolution (e.g. "1080p")
 * - {quality}            - Quality source (e.g. "HDTV", "WEB-DL", "BluRay")
 * - {video_codec}        - Video codec (e.g. "x265", "H.264")
 * - {audio_codec}        - Audio codec (e.g. "AAC", "FLAC")
 * - {audio_channels}     - Audio channels (e.g. "2.0", "5.1")
 */

import { sanitizeFilename } from "@/infra/filesystem/filesystem.ts";
import { formatEpisodeSegment } from "@/infra/media/identity/identity.ts";
import type { ParsedUnitIdentity } from "@packages/shared/index.ts";

export interface NamingInput {
  readonly title: string;
  readonly unitNumbers: readonly number[];
  readonly sourceIdentity?: ParsedUnitIdentity | undefined;
  readonly season?: number | undefined;
  readonly year?: number | undefined;
  readonly unitTitle?: string | undefined;
  readonly group?: string | undefined;
  readonly resolution?: string | undefined;
  readonly quality?: string | undefined;
  readonly videoCodec?: string | undefined;
  readonly audioCodec?: string | undefined;
  readonly audioChannels?: string | undefined;
  readonly airDate?: string | undefined;
}

const RESOLUTION_TOKEN_PATTERN = /\{resolution\}/;

const TOKEN_PATTERNS = {
  airDate: /\{air_date\}/g,
  audioChannels: /\{audio_channels\}/g,
  audioCodec: /\{audio_codec\}/g,
  unit: /\{(?:unit|episode)(?::(\d+))?\}/g,
  unitSegment: /\{(?:unit|episode)_segment\}/g,
  unitTitle: /\{unit_title\}/g,
  group: /\{group\}/g,
  quality: /\{quality\}/g,
  resolution: /\{resolution\}/g,
  season: /\{season(?::(\d+))?\}/g,
  sourceUnitSegment: /\{source_(?:unit|episode)_segment\}/g,
  title: /\{title\}/g,
  videoCodec: /\{video_codec\}/g,
  year: /\{year\}/g,
} as const;

const CLEANUP_PATTERNS = {
  duplicateDashSeparator: /(?:\s*-\s*){2,}/g,
  emptyRoundBracket: /\(\)/g,
  emptySquareBracket: /\[\]/g,
  leadingDashSeparator: /^\s*-\s+/g,
  multiWhitespace: /\s{2,}/g,
  trailingDashSeparator: /\s+-\s*$/g,
} as const;

const WRAPPED_SEGMENT_PATTERNS: Record<"(" | "[", RegExp> = {
  "(": /\(([^)]*)\)/g,
  "[": /\[([^\]]*)\]/g,
};

export function renderEpisodeFilename(format: string, input: NamingInput): string {
  const formatHasResolutionToken = RESOLUTION_TOKEN_PATTERN.test(format);
  const primaryUnit = input.unitNumbers[0] ?? 0;
  const segment = formatEpisodeSegment({
    unit_numbers: input.unitNumbers,
  });

  let sourceSegment = "";
  if (input.sourceIdentity) {
    sourceSegment = input.sourceIdentity.label;
  }

  let result = format;

  result = result.replace(TOKEN_PATTERNS.title, sanitizeFilename(input.title));

  result = result.replace(TOKEN_PATTERNS.unit, (_, padStr) => {
    const pad = padStr ? Number(padStr) : 2;
    return String(primaryUnit).padStart(pad, "0");
  });

  result = result.replace(TOKEN_PATTERNS.unitSegment, segment);

  result = result.replace(TOKEN_PATTERNS.sourceUnitSegment, sourceSegment || segment);

  result = result.replace(TOKEN_PATTERNS.airDate, input.airDate ?? "");

  result = result.replace(TOKEN_PATTERNS.season, (_, padStr) => {
    const pad = padStr ? Number(padStr) : 2;
    return input.season === undefined ? "" : String(input.season).padStart(pad, "0");
  });

  result = result.replace(
    TOKEN_PATTERNS.unitTitle,
    input.unitTitle ? sanitizeFilename(input.unitTitle) : "",
  );

  result = result.replace(TOKEN_PATTERNS.year, input.year ? String(input.year) : "");

  result = result.replace(TOKEN_PATTERNS.group, input.group ?? "");

  result = result.replace(TOKEN_PATTERNS.resolution, input.resolution ?? "");

  result = result.replace(
    TOKEN_PATTERNS.quality,
    normalizeQualityForFormat({
      formatHasResolutionToken,
      quality: input.quality,
      resolution: input.resolution,
    }) ?? "",
  );

  result = result.replace(TOKEN_PATTERNS.videoCodec, input.videoCodec ?? "");

  result = result.replace(TOKEN_PATTERNS.audioCodec, input.audioCodec ?? "");

  result = result.replace(TOKEN_PATTERNS.audioChannels, input.audioChannels ?? "");

  result = normalizeWrappedSegments(result, "[", "]");
  result = normalizeWrappedSegments(result, "(", ")");

  // Clean up empty segments that may leave dangling separators
  result = result
    .replace(CLEANUP_PATTERNS.emptySquareBracket, "")
    .replace(CLEANUP_PATTERNS.emptyRoundBracket, "")
    .replace(CLEANUP_PATTERNS.multiWhitespace, " ")
    .replace(CLEANUP_PATTERNS.duplicateDashSeparator, " - ")
    .replace(CLEANUP_PATTERNS.trailingDashSeparator, "")
    .replace(CLEANUP_PATTERNS.leadingDashSeparator, "")
    .trim();

  return result;
}

function normalizeWrappedSegments(value: string, open: "(" | "[", close: ")" | "]") {
  const pattern = WRAPPED_SEGMENT_PATTERNS[open];

  return value.replace(pattern, (_, inner: string) => {
    const normalized = inner.replace(/\s+/g, " ").trim();
    return normalized.length > 0 ? `${open}${normalized}${close}` : "";
  });
}

function normalizeQualityForFormat(input: {
  quality?: string | undefined;
  resolution?: string | undefined;
  formatHasResolutionToken: boolean;
}) {
  const quality = input.quality?.trim();
  if (!quality) {
    return undefined;
  }

  if (!input.formatHasResolutionToken) {
    return quality;
  }

  const resolution = input.resolution?.trim();
  if (!resolution) {
    return quality;
  }

  const stripped = quality
    .replace(new RegExp(`(^|[\\s_-])${escapeRegex(resolution)}(?=$|[\\s_-])`, "ig"), " ")
    .replace(/\s{2,}/g, " ")
    .trim();

  return stripped.length > 0 ? stripped : undefined;
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
