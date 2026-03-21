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

import { sanitizeFilename } from "./filesystem.ts";
import { formatEpisodeSegment } from "./media-identity.ts";
import type { ParsedEpisodeIdentity } from "../../../../packages/shared/src/index.ts";

export interface NamingInput {
  readonly title: string;
  readonly episodeNumbers: readonly number[];
  readonly sourceIdentity?: ParsedEpisodeIdentity;
  readonly season?: number;
  readonly year?: number;
  readonly episodeTitle?: string;
  readonly group?: string;
  readonly resolution?: string;
  readonly quality?: string;
  readonly videoCodec?: string;
  readonly audioCodec?: string;
  readonly audioChannels?: string;
  readonly airDate?: string;
}

export function renderEpisodeFilename(
  format: string,
  input: NamingInput,
): string {
  const formatHasResolutionToken = /\{resolution\}/.test(format);
  const primaryEpisode = input.episodeNumbers[0] ?? 0;
  const segment = formatEpisodeSegment({
    episode_numbers: input.episodeNumbers,
  });

  let sourceSegment = "";
  if (input.sourceIdentity) {
    sourceSegment = input.sourceIdentity.label;
  }

  let result = format;

  result = result.replace(/\{title\}/g, sanitizeFilename(input.title));

  result = result.replace(
    /\{episode(?::(\d+))?\}/g,
    (_, padStr) => {
      const pad = padStr ? Number(padStr) : 2;
      return String(primaryEpisode).padStart(pad, "0");
    },
  );

  result = result.replace(
    /\{episode_segment\}/g,
    segment,
  );

  result = result.replace(
    /\{source_episode_segment\}/g,
    sourceSegment || segment,
  );

  result = result.replace(
    /\{air_date\}/g,
    input.airDate ?? "",
  );

  result = result.replace(
    /\{season(?::(\d+))?\}/g,
    (_, padStr) => {
      const pad = padStr ? Number(padStr) : 2;
      return input.season === undefined
        ? ""
        : String(input.season).padStart(pad, "0");
    },
  );

  result = result.replace(
    /\{episode_title\}/g,
    input.episodeTitle ? sanitizeFilename(input.episodeTitle) : "",
  );

  result = result.replace(
    /\{year\}/g,
    input.year ? String(input.year) : "",
  );

  result = result.replace(
    /\{group\}/g,
    input.group ?? "",
  );

  result = result.replace(
    /\{resolution\}/g,
    input.resolution ?? "",
  );

  result = result.replace(
    /\{quality\}/g,
    normalizeQualityForFormat({
      formatHasResolutionToken,
      quality: input.quality,
      resolution: input.resolution,
    }) ?? "",
  );

  result = result.replace(
    /\{video_codec\}/g,
    input.videoCodec ?? "",
  );

  result = result.replace(
    /\{audio_codec\}/g,
    input.audioCodec ?? "",
  );

  result = result.replace(
    /\{audio_channels\}/g,
    input.audioChannels ?? "",
  );

  result = normalizeWrappedSegments(result, "[", "]");
  result = normalizeWrappedSegments(result, "(", ")");

  // Clean up empty segments that may leave dangling separators
  result = result
    .replace(/\[\]/g, "")
    .replace(/\(\)/g, "")
    .replace(/\s{2,}/g, " ")
    .replace(/(?:\s*-\s*){2,}/g, " - ")
    .replace(/\s+-\s*$/g, "")
    .replace(/^\s*-\s+/g, "")
    .trim();

  return result;
}

function normalizeWrappedSegments(
  value: string,
  open: "(" | "[",
  close: ")" | "]",
) {
  const openEscaped = open === "[" ? "\\[" : "\\(";
  const closeEscaped = close === "]" ? "\\]" : "\\)";
  const pattern = new RegExp(
    `${openEscaped}([^${closeEscaped}]*)${closeEscaped}`,
    "g",
  );

  return value.replace(pattern, (_, inner: string) => {
    const normalized = inner.replace(/\s+/g, " ").trim();
    return normalized.length > 0 ? `${open}${normalized}${close}` : "";
  });
}

function normalizeQualityForFormat(input: {
  quality?: string;
  resolution?: string;
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

  const stripped = quality.replace(
    new RegExp(
      `(^|[\\s_-])${escapeRegex(resolution)}(?=$|[\\s_-])`,
      "ig",
    ),
    " ",
  )
    .replace(/\s{2,}/g, " ")
    .trim();

  return stripped.length > 0 ? stripped : undefined;
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
