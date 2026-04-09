/**
 * Config-backed naming renderer for episode filenames.
 *
 * Supported placeholders:
 * - {title}              - Anime title (sanitized for filesystem)
 * - {episode}            - Primary episode number (zero-padded to 2 digits)
 * - {episode:02}         - Primary episode number (zero-padded to 2 digits)
 * - {episode:03}         - Primary episode number (zero-padded to 3 digits)
 * - {episode_segment}    - Entry-local numbering: "03", "03-04", "014"
 * - {episode_title}      - Episode title (sanitized for filesystem)
 * - {air_date}           - Air date in YYYY-MM-DD format (if available)
 * - {source_episode_segment} - Source label: "S02E03", "S01E01-E02", "2025-03-14"
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

import { sanitizeFilename } from "@/lib/filesystem.ts";
import { formatEpisodeSegment } from "@/lib/media-identity.ts";
import type { ParsedEpisodeIdentity } from "@packages/shared/index.ts";

export interface NamingInput {
  readonly title: string;
  readonly episodeNumbers: readonly number[];
  readonly sourceIdentity?: ParsedEpisodeIdentity | undefined;
  readonly season?: number | undefined;
  readonly year?: number | undefined;
  readonly episodeTitle?: string | undefined;
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
  episode: /\{episode(?::(\d+))?\}/g,
  episodeSegment: /\{episode_segment\}/g,
  episodeTitle: /\{episode_title\}/g,
  group: /\{group\}/g,
  quality: /\{quality\}/g,
  resolution: /\{resolution\}/g,
  season: /\{season(?::(\d+))?\}/g,
  sourceEpisodeSegment: /\{source_episode_segment\}/g,
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
  const primaryEpisode = input.episodeNumbers[0] ?? 0;
  const segment = formatEpisodeSegment({
    episode_numbers: input.episodeNumbers,
  });

  let sourceSegment = "";
  if (input.sourceIdentity) {
    sourceSegment = input.sourceIdentity.label;
  }

  let result = format;

  result = result.replace(TOKEN_PATTERNS.title, sanitizeFilename(input.title));

  result = result.replace(TOKEN_PATTERNS.episode, (_, padStr) => {
    const pad = padStr ? Number(padStr) : 2;
    return String(primaryEpisode).padStart(pad, "0");
  });

  result = result.replace(TOKEN_PATTERNS.episodeSegment, segment);

  result = result.replace(TOKEN_PATTERNS.sourceEpisodeSegment, sourceSegment || segment);

  result = result.replace(TOKEN_PATTERNS.airDate, input.airDate ?? "");

  result = result.replace(TOKEN_PATTERNS.season, (_, padStr) => {
    const pad = padStr ? Number(padStr) : 2;
    return input.season === undefined ? "" : String(input.season).padStart(pad, "0");
  });

  result = result.replace(
    TOKEN_PATTERNS.episodeTitle,
    input.episodeTitle ? sanitizeFilename(input.episodeTitle) : "",
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
