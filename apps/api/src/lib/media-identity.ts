/**
 * Canonical media identity parser.
 *
 * Single source of truth for parsing episode identities from both local
 * filenames and release titles. Replaces scattered regex sets across
 * file-scanner.ts, release-ranking.ts, and library-import.ts.
 */

import { parseAbsoluteIdentity } from "./media-identity-absolute.ts";
import { parseDailyIdentity } from "./media-identity-daily.ts";
import { parseSeasonEpisodeIdentity } from "./media-identity-season.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ParsedEpisodeIdentity =
  | {
    scheme: "season";
    season: number;
    episode_numbers: number[];
    label: string;
  }
  | {
    scheme: "absolute";
    episode_numbers: number[];
    label: string;
  }
  | {
    scheme: "daily";
    air_dates: string[];
    label: string;
  };

export interface PathParseContext {
  /** Title inferred from nearest entry folder (e.g. "Overlord II") */
  entry_folder_title?: string;
  /** Season hint from folder structure (e.g. 1 for "Season 1") */
  season_hint?: number;
  /** Whether folder indicates specials (Season 0, Specials) */
  is_specials_folder?: boolean;
  /** Whether folder name suggests a sequel (II, 2nd Season, etc.) */
  sequel_hint?: string;
}

export type MediaArtifactKind = "episode" | "extra" | "sample" | "unknown";

export interface ParsedMediaFile {
  kind: MediaArtifactKind;
  parsed_title: string;
  source_identity?: ParsedEpisodeIdentity;
  group?: string;
  resolution?: string;
  skip_reason?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const EXTRA_KEYWORDS = new Set([
  "extras",
  "extra",
  "featurette",
  "featurettes",
  "trailer",
  "trailers",
  "bonus",
  "bonus features",
  "special feature",
  "special features",
  "deleted scene",
  "deleted scenes",
]);

const EXTRA_FOLDER_NAMES = new Set([
  "extras",
  "extra",
  "featurettes",
  "trailers",
  "bonus",
  "bonus features",
  "special features",
  "deleted scenes",
]);

const SAMPLE_KEYWORDS = ["sample", "samples"];

const SPECIALS_FOLDER_NAMES = new Set([
  "specials",
  "special",
  "season 0",
  "season 00",
  "s00",
]);

const VIDEO_EXTENSIONS = new Set([".mkv", ".mp4", ".avi", ".mov", ".webm"]);

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse a local file path into a media identity. Uses folder context when the
 * filename alone is ambiguous.
 */
export function parseFileSourceIdentity(
  path: string,
  context?: PathParseContext,
): ParsedMediaFile {
  const filename = path.split("/").pop() ?? path;
  const extensionless = stripExtension(filename);

  // Step 1: Classify extras/samples
  const classification = classifyMediaArtifact(path, filename, context);
  if (classification.kind !== "episode") {
    return classification;
  }

  // Step 2: Extract group and resolution
  const group = extractGroup(filename);
  const resolution = extractResolution(extensionless);

  // Step 3: Try daily/airdate patterns first
  const daily = parseDailyIdentity(extensionless);
  if (daily) {
    return {
      kind: "episode",
      parsed_title: extractTitleBeforeIdentity(extensionless, daily.label) ||
        context?.entry_folder_title || extensionless,
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
      parsed_title: extractTitleBeforeIdentity(extensionless, seasonEp.label) ||
        context?.entry_folder_title || extensionless,
      source_identity: seasonEp,
      group,
      resolution,
    };
  }

  // Step 5: Try absolute number patterns
  const absolute = parseAbsoluteIdentity(extensionless, filename);
  if (absolute) {
    // If folder context provides a season hint, promote to season scheme
    if (
      context?.season_hint !== undefined ||
      context?.is_specials_folder
    ) {
      const season = context.is_specials_folder ? 0 : context.season_hint!;
      const promoted: ParsedEpisodeIdentity = {
        scheme: "season",
        season,
        episode_numbers: absolute.episode_numbers,
        label: season === 0
          ? `S00E${absolute.label}`
          : `S${String(season).padStart(2, "0")}E${absolute.label}`,
      };
      return {
        kind: "episode",
        parsed_title: context?.entry_folder_title ||
          extractTitleBeforeNumber(extensionless) || extensionless,
        source_identity: promoted,
        group,
        resolution,
      };
    }

    return {
      kind: "episode",
      parsed_title: context?.entry_folder_title ||
        extractTitleBeforeNumber(extensionless) || extensionless,
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
  const group = extractGroup(title);
  const resolution = extractResolution(title);

  // Daily
  const daily = parseDailyIdentity(title);
  if (daily) {
    return {
      kind: "episode",
      parsed_title: extractTitleBeforeIdentity(title, daily.label) || title,
      source_identity: daily,
      group,
      resolution,
    };
  }

  // Season/episode
  const seasonEp = parseSeasonEpisodeIdentity(title);
  if (seasonEp) {
    return {
      kind: "episode",
      parsed_title: extractTitleBeforeIdentity(title, seasonEp.label) || title,
      source_identity: seasonEp,
      group,
      resolution,
    };
  }

  // Absolute
  const absolute = parseAbsoluteIdentity(title, title);
  if (absolute) {
    return {
      kind: "episode",
      parsed_title: extractTitleBeforeNumber(title) || title,
      source_identity: absolute,
      group,
      resolution,
    };
  }

  return {
    kind: "unknown",
    parsed_title: title,
    group,
    resolution,
    skip_reason: "No episode identity found in release title",
  };
}

/**
 * Classify a file as episode, extra, sample, or unknown based on filename
 * and parent folder names.
 */
export function classifyMediaArtifact(
  path: string,
  name: string,
  _context?: PathParseContext,
): ParsedMediaFile {
  const lowerName = name.toLowerCase();
  const extensionless = stripExtension(lowerName);

  // Check file extension
  const ext = getExtension(name);
  if (ext && !VIDEO_EXTENSIONS.has(ext)) {
    return {
      kind: "unknown",
      parsed_title: name,
      skip_reason: `Not a video file: ${ext}`,
    };
  }

  // Check sample by filename prefix/keyword
  for (const keyword of SAMPLE_KEYWORDS) {
    if (
      extensionless === keyword ||
      extensionless.startsWith(`${keyword}-`) ||
      extensionless.startsWith(`${keyword}_`) ||
      extensionless.startsWith(`${keyword}.`)
    ) {
      return {
        kind: "sample",
        parsed_title: name,
        skip_reason: `Sample file: matches "${keyword}" pattern`,
      };
    }
  }

  // Check extra by filename
  for (const keyword of EXTRA_KEYWORDS) {
    if (extensionless === keyword) {
      return {
        kind: "extra",
        parsed_title: name,
        skip_reason: `Extra content: "${keyword}"`,
      };
    }
  }

  // Check parent folders
  const folders = path.split("/").slice(0, -1);
  for (const folder of folders) {
    const lowerFolder = folder.toLowerCase().trim();
    if (EXTRA_FOLDER_NAMES.has(lowerFolder)) {
      return {
        kind: "extra",
        parsed_title: name,
        skip_reason: `Inside extras folder: "${folder}"`,
      };
    }
    if (SAMPLE_KEYWORDS.includes(lowerFolder)) {
      return {
        kind: "sample",
        parsed_title: name,
        skip_reason: `Inside sample folder: "${folder}"`,
      };
    }
  }

  // Not an extra/sample — treat as potential episode
  return {
    kind: "episode",
    parsed_title: name,
  };
}

/**
 * Build folder context from a root path and a full file path.
 */
export function buildPathParseContext(
  rootPath: string,
  fullPath: string,
): PathParseContext {
  const normalizedRoot = rootPath.replace(/\/+$/, "");
  const normalizedFull = fullPath.replace(/\/+$/, "");

  // Get the relative path segments between root and file
  const relative = normalizedFull.startsWith(normalizedRoot + "/")
    ? normalizedFull.slice(normalizedRoot.length + 1)
    : normalizedFull;

  const segments = relative.split("/");
  // Remove the filename itself
  const folders = segments.slice(0, -1);

  const context: PathParseContext = {};

  // Use the root path's leaf folder as the default entry folder title
  const rootLeaf = normalizedRoot.split("/").pop();
  if (rootLeaf) {
    context.entry_folder_title = rootLeaf;
  }

  for (const folder of folders) {
    const lower = folder.toLowerCase().trim();

    // Check for specials folder
    if (SPECIALS_FOLDER_NAMES.has(lower)) {
      context.is_specials_folder = true;
      context.season_hint = 0;
      continue;
    }

    // Check for season folder: "Season 1", "Season 01", "S01"
    const seasonMatch = folder.match(
      /^(?:season\s+(\d{1,2})|s(\d{1,2}))$/i,
    );
    if (seasonMatch) {
      const num = Number(seasonMatch[1] ?? seasonMatch[2]);
      if (num === 0) {
        context.is_specials_folder = true;
        context.season_hint = 0;
      } else {
        context.season_hint = num;
      }
      continue;
    }

    // Check for sequel hints in folder names
    const sequelHint = extractSequelHint(folder);
    if (sequelHint) {
      context.sequel_hint = sequelHint;
    }

    // Use as entry folder title (the deepest non-season folder)
    if (!seasonMatch && !SPECIALS_FOLDER_NAMES.has(lower)) {
      context.entry_folder_title = folder;
    }
  }

  return context;
}

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
  const isContiguous = sorted.every(
    (n, i) => i === 0 || n === sorted[i - 1] + 1,
  );

  if (isContiguous) {
    return `${String(sorted[0]).padStart(pad, "0")}-${
      String(sorted[sorted.length - 1]).padStart(pad, "0")
    }`;
  }

  return sorted.map((n) => String(n).padStart(pad, "0")).join("-");
}

// ---------------------------------------------------------------------------
// Resolver and ranking re-export
// ---------------------------------------------------------------------------

export {
  rankAnimeCandidates,
  resolveSourceIdentityToEpisodeNumbers,
} from "./media-identity-ranking.ts";
export type { ResolvedEpisodeTarget } from "./media-identity-ranking.ts";

// Daily/season/absolute parsing moved to dedicated modules.

// ---------------------------------------------------------------------------
// Season/episode parsing
// ---------------------------------------------------------------------------

// Season/daily/absolute parsers now live in dedicated modules.

// ---------------------------------------------------------------------------
// Sequel hint extraction
// ---------------------------------------------------------------------------

function extractSequelHint(folderName: string): string | undefined {
  const lower = folderName.toLowerCase().trim();

  // "II", "III", "IV" etc. at the end
  const romanMatch = folderName.match(/\b(II|III|IV|V|VI)$/i);
  if (romanMatch) return romanMatch[1].toUpperCase();

  // "2nd Season", "3rd Season"
  const ordinalMatch = lower.match(
    /(\d+)(?:st|nd|rd|th)\s+season/,
  );
  if (ordinalMatch) return `Season ${ordinalMatch[1]}`;

  // "Season 2", "Season 3"
  const seasonMatch = lower.match(/season\s+(\d+)/);
  if (seasonMatch && Number(seasonMatch[1]) > 1) {
    return `Season ${seasonMatch[1]}`;
  }

  // "Part 2", "Cour 2"
  const partMatch = lower.match(/(?:part|cour)\s+(\d+)/);
  if (partMatch && Number(partMatch[1]) > 1) {
    return `Part ${partMatch[1]}`;
  }

  return undefined;
}

// ---------------------------------------------------------------------------
// Title extraction helpers
// ---------------------------------------------------------------------------

function extractTitleBeforeIdentity(
  value: string,
  label: string,
): string {
  // Remove group prefix [Group]
  let cleaned = value.replace(/^\[[^\]]+\]\s*/g, "");

  // Find where the identity label (or its components) appear and take text before
  const labelEscaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const labelPattern = new RegExp(
    `[\\s._-]+(?:${labelEscaped})(?:[\\s._-]|$)`,
    "i",
  );
  const match = cleaned.match(labelPattern);
  if (match?.index !== undefined) {
    cleaned = cleaned.slice(0, match.index);
  }

  // Also try to strip common identity patterns
  cleaned = cleaned
    .replace(
      /[\s._-]+s\d{1,2}[\s._-]*e\d{1,4}(?:[\s._-]*e?\d{1,4})*.*/i,
      "",
    )
    .replace(/[\s._-]+\d{1,2}x\d{1,3}.*/i, "")
    .replace(
      /[\s._-]+season[\s._-]*\d+[\s._-]*(?:ep|e|episode)[\s._-]*\d+.*/i,
      "",
    )
    .replace(
      /[\s._-]+season[\s._-]*\d+[\s._-]+(?:-[\s._-]*)?\d+.*/i,
      "",
    )
    .replace(
      /[\s._-]+\d{4}[\s._-]\d{2}[\s._-]\d{2}.*/,
      "",
    );

  // Clean up quality/codec/bracket tags
  cleaned = cleaned
    .replace(
      /\[[^\]]*?(?:1080p|720p|2160p|480p|x264|x265|hevc|aac|flac)[^\]]*\]/gi,
      "",
    )
    .replace(
      /\b(?:1080p|720p|2160p|480p|x264|x265|hevc|aac|flac|dual audio|webrip|web-dl|bluray|batch|complete)\b/gi,
      "",
    )
    .replace(/[._]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned;
}

function extractTitleBeforeNumber(value: string): string {
  let cleaned = value.replace(/^\[[^\]]+\]\s*/g, "");

  // Strip from the last separator + number onward
  cleaned = cleaned
    .replace(/[\s._-]+\d{1,4}(?:v\d+)?(?:[\s._-].*)?$/, "")
    .replace(
      /\[[^\]]*?(?:1080p|720p|2160p|480p|x264|x265|hevc|aac|flac)[^\]]*\]/gi,
      "",
    )
    .replace(
      /\b(?:1080p|720p|2160p|480p|x264|x265|hevc|aac|flac|dual audio|webrip|web-dl|bluray|batch|complete)\b/gi,
      "",
    )
    .replace(/[._]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned;
}

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

function extractGroup(value: string): string | undefined {
  const extensionless = stripExtension(value);
  const prefixMatch = extensionless.match(/^\[(.*?)\]/);
  const prefixGroup = prefixMatch?.[1]?.trim();

  if (prefixGroup && !looksLikeMetadataTag(prefixGroup)) {
    return prefixGroup;
  }

  const bracketGroups = [...extensionless.matchAll(/\[(.*?)\]/g)]
    .map((match) => match[1]?.trim())
    .filter((match): match is string => Boolean(match));

  for (let index = bracketGroups.length - 1; index >= 0; index -= 1) {
    const candidate = bracketGroups[index];

    if (!looksLikeMetadataTag(candidate)) {
      return candidate;
    }
  }

  const suffixMatch = extensionless.match(/-([A-Za-z0-9][A-Za-z0-9+_.&']*)$/);
  const suffixGroup = suffixMatch?.[1]?.trim();

  if (
    suffixGroup && /[A-Za-z]/.test(suffixGroup) &&
    !looksLikeMetadataTag(suffixGroup)
  ) {
    return suffixGroup;
  }

  return undefined;
}

const METADATA_TAG_PATTERNS: readonly RegExp[] = [
  /\b\d{3,4}p\b/i,
  /\b\d{3,4}x\d{3,4}\b/i,
  /\bv\d+\b/i,
  /\b(?:web(?:[ .-]?dl)?|webdl|webrip|web-?rip|web-?dl)\b/i,
  /\b(?:bluray|blu-ray|bd(?:remux|rip|mux)?|remux|hdtv|dvd|sdtv)\b/i,
  /\b(?:x264|x265|h[ .-]?264|h[ .-]?265|hevc|avc|av1|vp9|vp10|mpeg-?2?|vc-?1?)\b/i,
  /\b(?:aac|flac|opus|ac3|e-?ac3|ddp|dd[ .+]?\d(?:[ .]?\d)?)\b/i,
  /\b(?:true?hd|dts(?:-?hd)?(?:-?ma)?|pcm|l?pcm)\b/i,
  /\b(?:dual(?:[ .-]?audio)?|multi(?:[ .-]?audio)?|proper|repack|complete|batch)\b/i,
];

function looksLikeMetadataTag(value: string): boolean {
  const lower = value.trim().toLowerCase();

  if (lower.length === 0) {
    return true;
  }

  return METADATA_TAG_PATTERNS.some((pattern) => pattern.test(lower));
}

function extractResolution(value: string): string | undefined {
  const lower = value.toLowerCase();
  if (lower.includes("2160") || lower.includes("4k")) return "2160p";
  if (lower.includes("1080")) return "1080p";
  if (lower.includes("720")) return "720p";
  if (lower.includes("576")) return "576p";
  if (lower.includes("480")) return "480p";
  return undefined;
}

function stripExtension(filename: string): string {
  return filename.replace(/\.[^.]+$/, "");
}

function getExtension(filename: string): string | undefined {
  const match = filename.match(/(\.[^.]+)$/);
  return match?.[1]?.toLowerCase();
}
