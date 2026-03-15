/**
 * Config-backed naming renderer for episode filenames.
 *
 * Supported placeholders:
 * - {title}              - Anime title (sanitized for filesystem)
 * - {episode}            - Primary episode number (zero-padded to 2 digits)
 * - {episode:02}         - Primary episode number (zero-padded to 2 digits)
 * - {episode:03}         - Primary episode number (zero-padded to 3 digits)
 * - {episode_segment}    - Entry-local numbering: "03", "03-04", "014"
 * - {air_date}           - Air date in YYYY-MM-DD format (if available)
 * - {source_episode_segment} - Source label: "S02E03", "S01E01-E02", "2025-03-14"
 * - {season}             - Season number (zero-padded to 2 digits)
 * - {season:02}          - Season number (zero-padded to 2 digits)
 * - {group}              - Release group name
 * - {resolution}         - Video resolution (e.g. "1080p")
 */

import { sanitizeFilename } from "./filesystem.ts";
import { formatEpisodeSegment } from "./media-identity.ts";
import type { ParsedEpisodeIdentity } from "../../../../packages/shared/src/index.ts";

export interface NamingInput {
  readonly title: string;
  readonly episodeNumbers: readonly number[];
  readonly sourceIdentity?: ParsedEpisodeIdentity;
  readonly season?: number;
  readonly group?: string;
  readonly resolution?: string;
  readonly airDate?: string;
}

export function renderEpisodeFilename(
  format: string,
  input: NamingInput,
): string {
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
      return String(input.season ?? 1).padStart(pad, "0");
    },
  );

  result = result.replace(
    /\{group\}/g,
    input.group ?? "",
  );

  result = result.replace(
    /\{resolution\}/g,
    input.resolution ?? "",
  );

  // Clean up empty segments that may leave dangling separators
  result = result
    .replace(/\s*-\s*(?=\s*-)/g, " -")
    .replace(/\s+-\s*$/g, "")
    .replace(/^\s*-\s+/g, "")
    .trim();

  return result;
}
