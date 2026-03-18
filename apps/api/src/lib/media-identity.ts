/**
 * Canonical media identity parser.
 *
 * Single source of truth for parsing episode identities from both local
 * filenames and release titles. Replaces scattered regex sets across
 * episode-parser.ts, release-ranking.ts, and library-import.ts.
 */

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
// Resolver: map parsed identity to local episode numbers
// ---------------------------------------------------------------------------

export interface ResolvedEpisodeTarget {
  anime_id: number;
  episode_numbers: number[];
  primary_episode_number: number;
  source_identity?: ParsedEpisodeIdentity;
}

interface AnimeCandidate {
  id: number;
  title_romaji: string;
  title_english?: string;
  title_native?: string;
  format?: string;
  episode_count?: number;
}

interface EpisodeCandidate {
  number: number;
  aired?: string | null;
}

const SPECIAL_FORMATS = new Set(["OVA", "ONA", "OAD", "SPECIAL", "MOVIE"]);

/**
 * Resolve a parsed source identity to local episode numbers for a given anime entry.
 * Daily identities resolve by matching air dates against episode metadata.
 */
export function resolveSourceIdentityToEpisodeNumbers(input: {
  anime: AnimeCandidate;
  episodes: readonly EpisodeCandidate[];
  source_identity: ParsedEpisodeIdentity;
}): ResolvedEpisodeTarget | undefined {
  const { anime: animeRow, episodes: episodeRows, source_identity } = input;

  if (source_identity.scheme === "daily") {
    // Resolve by matching air dates to episodes.aired
    const matched: number[] = [];
    for (const date of source_identity.air_dates) {
      const ep = episodeRows.find((e) => e.aired === date);
      if (ep) matched.push(ep.number);
    }
    if (matched.length === 0) return undefined;
    return {
      anime_id: animeRow.id,
      episode_numbers: matched,
      primary_episode_number: matched[0],
      source_identity,
    };
  }

  if (source_identity.scheme === "season") {
    // For S00/specials, refuse to auto-resolve into a regular TV entry
    if (source_identity.season === 0 && !isSpecialLikeEntry(animeRow)) {
      return undefined;
    }
    // Use episode component directly as local episode numbers
    const eps = source_identity.episode_numbers.filter((n) =>
      n > 0 && n < 2000
    );
    if (eps.length === 0) return undefined;
    return {
      anime_id: animeRow.id,
      episode_numbers: eps,
      primary_episode_number: eps[0],
      source_identity,
    };
  }

  // Absolute — use directly
  const eps = source_identity.episode_numbers.filter((n) => n > 0 && n < 2000);
  if (eps.length === 0) return undefined;
  return {
    anime_id: animeRow.id,
    episode_numbers: eps,
    primary_episode_number: eps[0],
    source_identity,
  };
}

/**
 * Rank anime candidates for a parsed file, preferring sequels/specials
 * based on source season hints and folder context.
 */
export function rankAnimeCandidates(input: {
  parsed: ParsedMediaFile;
  candidates: readonly AnimeCandidate[];
  context?: PathParseContext;
}): AnimeCandidate | undefined {
  const { parsed, candidates, context } = input;
  if (candidates.length === 0) return undefined;
  if (candidates.length === 1) return candidates[0];

  const identity = parsed.source_identity;
  const scores = candidates.map((candidate) => {
    let score = 0;

    // Title match scoring
    const titleScore = bestTitleScore(
      parsed.parsed_title,
      candidate,
    );
    score += titleScore * 100;

    // Season hint matching for sequel preference
    if (identity?.scheme === "season" && identity.season > 0) {
      if (hasSequelMarker(candidate, identity.season)) {
        score += 50;
      }
    }

    // S00/specials prefer special-like entries
    if (identity?.scheme === "season" && identity.season === 0) {
      if (isSpecialLikeEntry(candidate)) {
        score += 50;
      } else {
        score -= 100; // Heavily penalize regular entries for S00
      }
    }

    // Folder sequel hint
    if (context?.sequel_hint) {
      const candidateTitle = (candidate.title_romaji + " " +
        (candidate.title_english ?? "")).toLowerCase();
      if (candidateTitle.includes(context.sequel_hint.toLowerCase())) {
        score += 30;
      }
    }

    // Folder specials hint
    if (context?.is_specials_folder) {
      if (isSpecialLikeEntry(candidate)) {
        score += 30;
      } else {
        score -= 50;
      }
    }

    return { candidate, score };
  });

  scores.sort((a, b) => b.score - a.score);
  // Only return if the best candidate has a reasonable score
  return scores[0].score > 0 ? scores[0].candidate : undefined;
}

function isSpecialLikeEntry(candidate: AnimeCandidate): boolean {
  if (candidate.format && SPECIAL_FORMATS.has(candidate.format.toUpperCase())) {
    return true;
  }
  const titles = [
    candidate.title_romaji,
    candidate.title_english ?? "",
  ].join(" ").toLowerCase();
  return /\b(?:ova|ona|oad|special|specials|movie)\b/i.test(titles);
}

function hasSequelMarker(candidate: AnimeCandidate, season: number): boolean {
  const titles = [
    candidate.title_romaji,
    candidate.title_english ?? "",
  ].join(" ").toLowerCase();

  // Check for roman numeral matching the season
  const romanNumerals: Record<number, string> = {
    2: "ii",
    3: "iii",
    4: "iv",
    5: "v",
    6: "vi",
  };
  if (romanNumerals[season] && titles.includes(romanNumerals[season])) {
    return true;
  }

  // Check for "Season N", "Nth Season", "Part N"
  const seasonPatterns = [
    new RegExp(`\\bseason\\s+${season}\\b`),
    new RegExp(`\\b${season}(?:st|nd|rd|th)\\s+season\\b`),
    new RegExp(`\\bpart\\s+${season}\\b`),
    new RegExp(`\\bcour\\s+${season}\\b`),
  ];
  return seasonPatterns.some((p) => p.test(titles));
}

function bestTitleScore(
  parsedTitle: string,
  candidate: AnimeCandidate,
): number {
  const normalized = normalizeForMatch(parsedTitle);
  const titles = [
    candidate.title_romaji,
    candidate.title_english ?? "",
    candidate.title_native ?? "",
  ].filter((t) => t.length > 0);

  return Math.max(
    0,
    ...titles.map((t) => simpleMatchScore(normalized, normalizeForMatch(t))),
  );
}

function normalizeForMatch(value: string): string {
  return value
    .toLowerCase()
    .replace(/\((19|20)\d{2}\)/g, " ")
    .replace(/\b(?:the|season|part|cour|ova|ona|tv|movie|special)\b/g, " ")
    .replace(/\biii\b/g, "3")
    .replace(/\bii\b/g, "2")
    .replace(/\biv\b/g, "4")
    .replace(/\bvi\b/g, "6")
    .replace(/\bv\b/g, "5")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function simpleMatchScore(left: string, right: string): number {
  if (left.length === 0 || right.length === 0) return 0;
  if (left === right) return 1;
  if (left.includes(right) || right.includes(left)) return 0.8;
  const leftTokens = new Set(left.split(" ").filter(Boolean));
  const rightTokens = new Set(right.split(" ").filter(Boolean));
  const intersection = [...leftTokens].filter((t) => rightTokens.has(t)).length;
  const union = new Set([...leftTokens, ...rightTokens]).size;
  return union === 0 ? 0 : intersection / union;
}

// ---------------------------------------------------------------------------
// Daily / airdate parsing
// ---------------------------------------------------------------------------

function parseDailyIdentity(
  value: string,
): (ParsedEpisodeIdentity & { scheme: "daily" }) | undefined {
  // YYYY-MM-DD or YYYY.MM.DD or YYYY MM DD
  const ymdMatch = value.match(
    /(?:^|[\s._\-[(])(\d{4})[\s._-](\d{2})[\s._-](\d{2})(?:[\s._\-\])]|$)/,
  );
  if (ymdMatch) {
    const [year, month, day] = [
      Number(ymdMatch[1]),
      Number(ymdMatch[2]),
      Number(ymdMatch[3]),
    ];
    if (isValidDate(year, month, day)) {
      const dateStr = `${year}-${String(month).padStart(2, "0")}-${
        String(day).padStart(2, "0")
      }`;
      return {
        scheme: "daily",
        air_dates: [dateStr],
        label: dateStr,
      };
    }
  }

  // DD-MM-YYYY or DD.MM.YYYY (only when year is last and date valid)
  const dmyMatch = value.match(
    /(?:^|[\s._\-[(])(\d{2})[\s._-](\d{2})[\s._-](\d{4})(?:[\s._\-\])]|$)/,
  );
  if (dmyMatch) {
    const [day, month, year] = [
      Number(dmyMatch[1]),
      Number(dmyMatch[2]),
      Number(dmyMatch[3]),
    ];
    if (isValidDate(year, month, day) && year >= 1900 && year <= 2100) {
      const dateStr = `${year}-${String(month).padStart(2, "0")}-${
        String(day).padStart(2, "0")
      }`;
      return {
        scheme: "daily",
        air_dates: [dateStr],
        label: dateStr,
      };
    }
  }

  return undefined;
}

// ---------------------------------------------------------------------------
// Season/episode parsing
// ---------------------------------------------------------------------------

function parseSeasonEpisodeIdentity(
  value: string,
): (ParsedEpisodeIdentity & { scheme: "season" }) | undefined {
  // S01E01-E02 / S01E01-02 range (check BEFORE multi-E to expand correctly)
  const rangeMatch = value.match(
    /(?:^|[\s._-])s(\d{1,2})[\s._-]*e(\d{1,4})\s*[-~]\s*(?:s\d{1,2}[\s._-]*)?e?(\d{1,4})(?:[\s._-]|$)/i,
  );
  if (rangeMatch) {
    const season = Number(rangeMatch[1]);
    const start = Number(rangeMatch[2]);
    const end = Number(rangeMatch[3]);
    if (start > 0 && end >= start && end - start <= 500 && end < 2000) {
      const eps = rangeArray(start, end);
      return {
        scheme: "season",
        season,
        episode_numbers: eps,
        label: formatSeasonLabel(season, eps),
      };
    }
  }

  // S01E01E02 (multi-episode without range hyphen, e.g. S01E01E02E03)
  const multiMatch = value.match(
    /(?:^|[\s._-])s(\d{1,2})[\s._-]*e(\d{1,4})(?:[\s._-]*e(\d{1,4}))+(?:[\s._-]|$)/i,
  );
  if (multiMatch) {
    const season = Number(multiMatch[1]);
    const eps = collectSeasonEpisodes(value, season);
    if (eps.length > 0) {
      return {
        scheme: "season",
        season,
        episode_numbers: eps,
        label: formatSeasonLabel(season, eps),
      };
    }
  }

  // S01E01 (single)
  const singleMatch = value.match(
    /(?:^|[\s._-])s(\d{1,2})[\s._-]*e(\d{1,4})(?:v\d+)?(?:[\s._-]|$)/i,
  );
  if (singleMatch) {
    const season = Number(singleMatch[1]);
    const ep = Number(singleMatch[2]);
    if (ep > 0 && ep < 2000) {
      return {
        scheme: "season",
        season,
        episode_numbers: [ep],
        label: `S${String(season).padStart(2, "0")}E${
          String(ep).padStart(2, "0")
        }`,
      };
    }
  }

  // 1x01-02 range
  const crossRangeMatch = value.match(
    /(?:^|[\s._-])(\d{1,2})x(\d{1,3})\s*[-~]\s*(?:\d{1,2}x)?(\d{1,3})(?:[\s._-]|$)/i,
  );
  if (crossRangeMatch) {
    const season = Number(crossRangeMatch[1]);
    const start = Number(crossRangeMatch[2]);
    const end = Number(crossRangeMatch[3]);
    if (start > 0 && end >= start && end - start <= 500 && end < 2000) {
      const eps = rangeArray(start, end);
      return {
        scheme: "season",
        season,
        episode_numbers: eps,
        label: formatSeasonLabel(season, eps),
      };
    }
  }

  // 1x01 (single)
  const crossMatch = value.match(
    /(?:^|[\s._-])(\d{1,2})x(\d{1,3})(?:[\s._-]|$)/i,
  );
  if (crossMatch) {
    const season = Number(crossMatch[1]);
    const ep = Number(crossMatch[2]);
    if (ep > 0 && ep < 2000) {
      return {
        scheme: "season",
        season,
        episode_numbers: [ep],
        label: `S${String(season).padStart(2, "0")}E${
          String(ep).padStart(2, "0")
        }`,
      };
    }
  }

  // "Season 1 Episode 3" style
  const longMatch = value.match(
    /(?:^|[\s._-])season[\s._-]*(\d{1,2})[\s._-]*(?:ep|e|episode)[\s._-]*(\d{1,3})(?:[\s._-]|$)/i,
  );
  if (longMatch) {
    const season = Number(longMatch[1]);
    const ep = Number(longMatch[2]);
    if (ep > 0 && ep < 2000) {
      return {
        scheme: "season",
        season,
        episode_numbers: [ep],
        label: `S${String(season).padStart(2, "0")}E${
          String(ep).padStart(2, "0")
        }`,
      };
    }
  }

  // "Season 2 - 03" style (season number followed by separator then episode)
  const seasonDashMatch = value.match(
    /(?:^|[\s._-])season[\s._-]*(\d{1,2})[\s._-]+(?:-[\s._-]*)?(\d{1,3})(?:[\s._\-\[\(]|$)/i,
  );
  if (seasonDashMatch) {
    const season = Number(seasonDashMatch[1]);
    const ep = Number(seasonDashMatch[2]);
    if (ep > 0 && ep < 2000) {
      return {
        scheme: "season",
        season,
        episode_numbers: [ep],
        label: `S${String(season).padStart(2, "0")}E${
          String(ep).padStart(2, "0")
        }`,
      };
    }
  }

  return undefined;
}

function collectSeasonEpisodes(value: string, _season: number): number[] {
  // Find all E## patterns after an S## prefix
  const fullMatch = value.match(
    /s(\d{1,2})([\s._-]*e\d{1,4}(?:[\s._-]*e\d{1,4})*)/i,
  );
  if (!fullMatch) return [];

  const episodePart = fullMatch[2];
  const epMatches = episodePart.matchAll(/e(\d{1,4})/gi);
  const episodes: number[] = [];
  for (const m of epMatches) {
    const num = Number(m[1]);
    if (num > 0 && num < 2000) {
      episodes.push(num);
    }
  }
  return episodes;
}

// ---------------------------------------------------------------------------
// Absolute number parsing
// ---------------------------------------------------------------------------

function parseAbsoluteIdentity(
  extensionless: string,
  filename: string,
): (ParsedEpisodeIdentity & { scheme: "absolute" }) | undefined {
  // Explicit episode markers: E01, EP01, Episode 01
  const epMatch = extensionless.match(
    /(?:^|[\s._-])(?:e|ep|episode)[\s._-]*(\d{1,4})(?:v\d+)?(?:[\s._-]|$)/i,
  );
  if (epMatch) {
    const num = Number(epMatch[1]);
    if (num > 0 && num < 2000) {
      return {
        scheme: "absolute",
        episode_numbers: [num],
        label: String(num).padStart(2, "0"),
      };
    }
  }

  // Anime fansub style: [Group] Title - 01 [1080p]
  const bracketMatch = filename.match(
    /\][\s._-]*(\d{1,4})(?:v\d+)?[\s._-]*(?:\[|$)/,
  );
  if (bracketMatch) {
    const num = Number(bracketMatch[1]);
    if (num > 0 && num < 2000) {
      return {
        scheme: "absolute",
        episode_numbers: [num],
        label: String(num).padStart(2, "0"),
      };
    }
  }

  // Range pattern: 01-02, 03~04 (but NOT date-like patterns)
  const rangeResult = parseAbsoluteRange(extensionless);
  if (rangeResult) {
    return rangeResult;
  }

  // Standalone number after title separator: Title - 01.mkv, Title_01.mkv
  const standaloneMatch = filename.match(
    /[\s._-](\d{1,4})(?:v\d+)?[\s._-]*\.[a-zA-Z]+$/,
  );
  if (standaloneMatch) {
    const num = Number(standaloneMatch[1]);
    if (num > 0 && num < 2000 && !isYearLike(num)) {
      return {
        scheme: "absolute",
        episode_numbers: [num],
        label: String(num).padStart(2, "0"),
      };
    }
  }

  // Fallback: last non-year number in cleaned filename
  const cleanFilename = filename
    .replace(/\[.*?\]/g, "")
    .replace(/\(.*?\)/g, "")
    .replace(/(?:480|720|1080|2160)[pi]/gi, "")
    .replace(/[hx]26[45]/gi, "")
    .replace(/[._-]/g, " ");

  const candidates: number[] = [];
  const numberPattern = /\b(\d{1,4})\b/g;
  let numMatch: RegExpExecArray | null;
  while ((numMatch = numberPattern.exec(cleanFilename)) !== null) {
    const num = Number(numMatch[1]);
    if (num > 0 && num < 2000 && !isYearLike(num)) {
      candidates.push(num);
    }
  }

  if (candidates.length > 0) {
    const num = candidates[candidates.length - 1];
    return {
      scheme: "absolute",
      episode_numbers: [num],
      label: String(num).padStart(2, "0"),
    };
  }

  return undefined;
}

function parseAbsoluteRange(
  value: string,
): (ParsedEpisodeIdentity & { scheme: "absolute" }) | undefined {
  // S##E##-E## is handled by season parser, skip those
  if (/s\d{1,2}[\s._-]*e/i.test(value)) return undefined;

  // Match patterns like "- 01-02", "_ 03~04" but not date patterns
  const rangePatterns = [
    // Explicit episode range with markers: E01-E02, EP01-EP02
    /(?:^|[\s._-])(?:e|ep)[\s._-]*(\d{1,3})\s*[-~]\s*(?:e|ep)?[\s._-]*(\d{1,3})(?:[\s._-]|$)/i,
    // Bare number range after separator: Title - 01-02
    /(?:^|[\s._-])(\d{1,3})\s*[-~]\s*(\d{1,3})(?:[\s._-]|$)/,
  ];

  for (const pattern of rangePatterns) {
    const match = value.match(pattern);
    if (!match) continue;

    const start = Number(match[1]);
    const end = Number(match[2]);

    if (
      start > 0 && end > 0 && end >= start && end < 2000 &&
      end - start <= 500 && !isYearLike(start) && !isYearLike(end)
    ) {
      // Extra guard: don't treat date-like "03-14" as a range when it could be
      // month-day. If both numbers are <= 31 and the range would be > 5, be
      // conservative and skip (daily parser should have caught real dates).
      if (start <= 12 && end <= 31 && end - start > 5) {
        // Check if there's a year-like number nearby that suggests a date
        if (/(?:19|20)\d{2}/.test(value)) {
          continue;
        }
      }

      const eps = rangeArray(start, end);
      return {
        scheme: "absolute",
        episode_numbers: eps,
        label: eps.length === 1
          ? String(eps[0]).padStart(2, "0")
          : `${String(start).padStart(2, "0")}-${String(end).padStart(2, "0")}`,
      };
    }
  }

  return undefined;
}

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

function looksLikeMetadataTag(value: string): boolean {
  const lower = value.trim().toLowerCase();

  if (lower.length === 0) {
    return true;
  }

  return [
    /\b\d{3,4}p\b/i,
    /\b\d{3,4}x\d{3,4}\b/i,
    /\bv\d+\b/i,
    /\b(?:web(?:[ .-]?dl)?|webdl|webrip|web-?rip|web-?dl)\b/i,
    /\b(?:bluray|blu-ray|bd(?:remux|rip|mux)?|remux|hdtv|dvD|sdtv)\b/i,
    /\b(?:x264|x265|h[ .-]?264|h[ .-]?265|hevc|avc|av1|vp9|vp10|mpeg-?2?|vc-?1?)\b/i,
    /\b(?:aac|flac|opus|ac3|e-?ac3|ddp|dd[ .+]?\d(?:[ .]?\d)?)\b/i,
    /\b(?:true?hd|dts(?:-?hd)?(?:-?ma)?|pcm|l?pcm)\b/i,
    /\b(?:dual(?:[ .-]?audio)?|multi(?:[ .-]?audio)?|proper|repack|complete|batch)\b/i,
  ].some((pattern) => pattern.test(lower));
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

function isYearLike(num: number): boolean {
  return num >= 1900 && num <= 2100;
}

function isValidDate(year: number, month: number, day: number): boolean {
  if (year < 1900 || year > 2100) return false;
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;
  const date = new Date(year, month - 1, day);
  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}

function rangeArray(start: number, end: number): number[] {
  return Array.from({ length: end - start + 1 }, (_, i) => start + i);
}

function formatSeasonLabel(season: number, episodes: number[]): string {
  const s = String(season).padStart(2, "0");
  if (episodes.length === 1) {
    return `S${s}E${String(episodes[0]).padStart(2, "0")}`;
  }
  const sorted = [...episodes].sort((a, b) => a - b);
  const first = String(sorted[0]).padStart(2, "0");
  const last = String(sorted[sorted.length - 1]).padStart(2, "0");

  // Check if contiguous and format accordingly
  const isContiguous = sorted.every(
    (n, i) => i === 0 || n === sorted[i - 1] + 1,
  );
  if (isContiguous) {
    return `S${s}E${first}-E${last}`;
  }
  return sorted.map((ep) => `S${s}E${String(ep).padStart(2, "0")}`).join("-");
}
