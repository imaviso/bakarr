import type { ParsedEpisodeIdentity, ParsedMediaFile, PathParseContext } from "./media-identity.ts";

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
    if (source_identity.season === 0 && !isSpecialLikeEntry(animeRow)) {
      return undefined;
    }
    const eps = source_identity.episode_numbers.filter((n: number) => n > 0 && n < 2000);
    if (eps.length === 0) return undefined;
    return {
      anime_id: animeRow.id,
      episode_numbers: eps,
      primary_episode_number: eps[0],
      source_identity,
    };
  }

  const eps = source_identity.episode_numbers.filter((n: number) => n > 0 && n < 2000);
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

    const titleScore = bestTitleScore(parsed.parsed_title, candidate);
    score += titleScore * 100;

    if (identity?.scheme === "season" && identity.season > 0) {
      if (hasSequelMarker(candidate, identity.season)) {
        score += 50;
      }
    }

    if (identity?.scheme === "season" && identity.season === 0) {
      if (isSpecialLikeEntry(candidate)) {
        score += 50;
      } else {
        score -= 100;
      }
    }

    if (context?.sequel_hint) {
      const candidateTitle = (
        candidate.title_romaji +
        " " +
        (candidate.title_english ?? "")
      ).toLowerCase();
      if (candidateTitle.includes(context.sequel_hint.toLowerCase())) {
        score += 30;
      }
    }

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
  return scores[0].score > 0 ? scores[0].candidate : undefined;
}

function isSpecialLikeEntry(candidate: AnimeCandidate): boolean {
  if (candidate.format && SPECIAL_FORMATS.has(candidate.format.toUpperCase())) {
    return true;
  }
  const titles = [candidate.title_romaji, candidate.title_english ?? ""].join(" ").toLowerCase();
  return /\b(?:ova|ona|oad|special|specials|movie)\b/i.test(titles);
}

function hasSequelMarker(candidate: AnimeCandidate, season: number): boolean {
  const titles = [candidate.title_romaji, candidate.title_english ?? ""].join(" ").toLowerCase();

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

  const seasonPatterns = [
    new RegExp(`\\bseason\\s+${season}\\b`),
    new RegExp(`\\b${season}(?:st|nd|rd|th)\\s+season\\b`),
    new RegExp(`\\bpart\\s+${season}\\b`),
    new RegExp(`\\bcour\\s+${season}\\b`),
  ];
  return seasonPatterns.some((p) => p.test(titles));
}

function bestTitleScore(parsedTitle: string, candidate: AnimeCandidate): number {
  const normalized = normalizeForMatch(parsedTitle);
  const titles = [
    candidate.title_romaji,
    candidate.title_english ?? "",
    candidate.title_native ?? "",
  ].filter((t) => t.length > 0);

  return Math.max(0, ...titles.map((t) => simpleMatchScore(normalized, normalizeForMatch(t))));
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
