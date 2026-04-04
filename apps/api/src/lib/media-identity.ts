/**
 * Canonical media identity parser.
 *
 * Single source of truth for parsing episode identities from both local
 * filenames and release titles. Replaces scattered regex sets across
 * file-scanner.ts, release-ranking.ts, and library-import.ts.
 */

import {
  AbsoluteEpisodeIdentity,
  DailyEpisodeIdentity,
  type ParsedEpisodeIdentity,
  ParsedEpisodeIdentitySchema,
  SeasonEpisodeIdentity,
  getEpisodeNumbersFromSourceIdentity,
  getSourceIdentityAirDate,
  getSourceIdentitySeason,
  toSharedParsedEpisodeIdentity,
} from "@/lib/media-identity-model.ts";
import type { ParsedMediaFile, PathParseContext } from "@/lib/media-identity-types.ts";
import {
  buildPathParseContext,
  classifyMediaArtifact,
  extractGroup,
  extractResolution,
  extractTitleBeforeIdentity,
  extractTitleBeforeNumber,
  stripExtension,
} from "@/lib/media-identity-file-helpers.ts";
import { normalizeSourceText } from "@/lib/media-identity-normalize.ts";

import { parseAbsoluteIdentity } from "@/lib/media-identity-absolute.ts";
import { parseDailyIdentity } from "@/lib/media-identity-daily.ts";
import { parseSeasonEpisodeIdentity } from "@/lib/media-identity-season.ts";

export type { ParsedEpisodeIdentity } from "@/lib/media-identity-model.ts";
export type { ParsedMediaFile, PathParseContext } from "@/lib/media-identity-types.ts";

export {
  AbsoluteEpisodeIdentity,
  DailyEpisodeIdentity,
  ParsedEpisodeIdentitySchema,
  SeasonEpisodeIdentity,
  getEpisodeNumbersFromSourceIdentity,
  getSourceIdentityAirDate,
  getSourceIdentitySeason,
  toSharedParsedEpisodeIdentity,
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse a local file path into a media identity. Uses folder context when the
 * filename alone is ambiguous.
 */
export function parseFileSourceIdentity(path: string, context?: PathParseContext): ParsedMediaFile {
  const filename = path.split("/").pop() ?? path;
  const normalizedFilename = normalizeSourceText(filename);
  const extensionless = stripExtension(normalizedFilename);

  // Step 1: Classify extras/samples
  const classification = classifyMediaArtifact(path, normalizedFilename, context);
  if (classification.kind !== "episode") {
    return classification;
  }

  // Step 2: Extract group and resolution
  const group = extractGroup(normalizedFilename);
  const resolution = extractResolution(extensionless);

  // Step 3: Try daily/airdate patterns first
  const daily = parseDailyIdentity(extensionless);
  if (daily) {
    return {
      kind: "episode",
      parsed_title:
        extractTitleBeforeIdentity(extensionless, daily.label) ||
        context?.entry_folder_title ||
        extensionless,
      source_identity: daily,
      group,
      resolution,
    };
  }

  // Step 4: Try season/episode patterns (S01E01, 1x01, Season 1 Episode 1)
  const seasonEp = parseSeasonEpisodeIdentity(extensionless);
  if (seasonEp) {
    return {
      kind: "episode",
      parsed_title:
        extractTitleBeforeIdentity(extensionless, seasonEp.label) ||
        context?.entry_folder_title ||
        extensionless,
      source_identity: seasonEp,
      group,
      resolution,
    };
  }

  // Step 5: Try absolute number patterns
  const absolute = parseAbsoluteIdentity(extensionless, normalizedFilename, {
    avoidSeasonOnlyFallback: true,
  });
  if (absolute) {
    // If folder context provides a season hint, promote to season scheme
    if (context?.season_hint !== undefined || context?.is_specials_folder) {
      const season = context.is_specials_folder ? 0 : context.season_hint;

      if (season === undefined) {
        return {
          kind: "episode",
          parsed_title:
            context?.entry_folder_title || extractTitleBeforeNumber(extensionless) || extensionless,
          source_identity: absolute,
          group,
          resolution,
        };
      }

      const promoted = new SeasonEpisodeIdentity({
        scheme: "season",
        season,
        episode_numbers: absolute.episode_numbers,
        label:
          season === 0
            ? `S00E${absolute.label}`
            : `S${String(season).padStart(2, "0")}E${absolute.label}`,
      });
      return {
        kind: "episode",
        parsed_title:
          context?.entry_folder_title || extractTitleBeforeNumber(extensionless) || extensionless,
        source_identity: promoted,
        group,
        resolution,
      };
    }

    return {
      kind: "episode",
      parsed_title:
        context?.entry_folder_title || extractTitleBeforeNumber(extensionless) || extensionless,
      source_identity: absolute,
      group,
      resolution,
    };
  }

  // Step 6: No reliable identity
  return {
    kind: "unknown",
    parsed_title: context?.entry_folder_title || extensionless,
    group,
    resolution,
    skip_reason: "No episode identity found in filename",
  };
}

/**
 * Parse a release title (RSS/search result) into a media identity.
 * No folder context is available for release titles.
 */
export function parseReleaseSourceIdentity(title: string): ParsedMediaFile {
  const normalizedTitle = normalizeSourceText(title);
  const group = extractGroup(normalizedTitle);
  const resolution = extractResolution(normalizedTitle);

  // Daily
  const daily = parseDailyIdentity(normalizedTitle);
  if (daily) {
    return {
      kind: "episode",
      parsed_title: extractTitleBeforeIdentity(normalizedTitle, daily.label) || normalizedTitle,
      source_identity: daily,
      group,
      resolution,
    };
  }

  // Season/episode
  const seasonEp = parseSeasonEpisodeIdentity(normalizedTitle);
  if (seasonEp) {
    return {
      kind: "episode",
      parsed_title: extractTitleBeforeIdentity(normalizedTitle, seasonEp.label) || normalizedTitle,
      source_identity: seasonEp,
      group,
      resolution,
    };
  }

  // Absolute
  const absolute = parseAbsoluteIdentity(normalizedTitle, normalizedTitle, {
    avoidSeasonOnlyFallback: true,
  });
  if (absolute) {
    return {
      kind: "episode",
      parsed_title: extractTitleBeforeNumber(normalizedTitle) || normalizedTitle,
      source_identity: absolute,
      group,
      resolution,
    };
  }

  return {
    kind: "unknown",
    parsed_title: normalizedTitle,
    group,
    resolution,
    skip_reason: "No episode identity found in release title",
  };
}

/**
 * Classify a file as episode, extra, sample, or unknown based on filename
 * and parent folder names.
 */
export { buildPathParseContext, classifyMediaArtifact };

/**
 * Format episode numbers into a display segment for rename/import filenames.
 */
export function formatEpisodeSegment(input: {
  episode_numbers: readonly number[];
  source_identity?: ParsedEpisodeIdentity;
  use_source_label?: boolean;
}): string {
  if (input.use_source_label && input.source_identity) {
    return input.source_identity.label;
  }

  if (input.episode_numbers.length === 0) return "00";

  const sorted = [...input.episode_numbers].sort((a, b) => a - b);
  const pad = sorted[sorted.length - 1] >= 100 ? 3 : 2;

  if (sorted.length === 1) {
    return String(sorted[0]).padStart(pad, "0");
  }

  // Check if contiguous
  const isContiguous = sorted.every((n, i) => i === 0 || n === sorted[i - 1] + 1);

  if (isContiguous) {
    return `${String(sorted[0]).padStart(pad, "0")}-${String(sorted[sorted.length - 1]).padStart(
      pad,
      "0",
    )}`;
  }

  return sorted.map((n) => String(n).padStart(pad, "0")).join("-");
}

// ---------------------------------------------------------------------------
// Resolver and ranking re-export
// ---------------------------------------------------------------------------

export {
  rankAnimeCandidates,
  resolveSourceIdentityToEpisodeNumbers,
} from "@/lib/media-identity-ranking.ts";
export type { ResolvedEpisodeTarget } from "@/lib/media-identity-ranking.ts";

// Daily/season/absolute parsing moved to dedicated modules.

// ---------------------------------------------------------------------------
// Season/episode parsing
// ---------------------------------------------------------------------------

// Season/daily/absolute parsers now live in dedicated modules.
