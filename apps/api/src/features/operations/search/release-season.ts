import { Result, Schema } from "effect";

import { parseReleaseSourceIdentity } from "@/features/media/identity/identity.ts";

const ROMAN_SEASON: Record<string, number> = {
  II: 2,
  III: 3,
  IV: 4,
  V: 5,
  VI: 6,
  VII: 7,
  VIII: 8,
  IX: 9,
  X: 10,
};

const SPECIAL_FORMATS = new Set(["OVA", "ONA", "OAD", "SPECIAL", "MOVIE"]);

const ORDINAL_SEASON_PATTERN = /\b(\d{1,2})(?:st|nd|rd|th)\s+season\b/i;
const LONG_SEASON_PATTERN = /\bseason\s+(\d{1,2})\b/i;
const PART_COUR_PATTERN = /\b(?:part|cour)\s+(\d{1,2})\b/i;
const SHORT_SEASON_PATTERN = /\bS(\d{1,2})\b/i;
// Roman season markers appear either trailing ("Overlord II") or mid-title
// before a subtitle separator ("Mushoku Tensei III: ...", "Mushoku Tensei III - 14",
// "無職転生III ～..."). Require a separator/end lookahead so "Hunter x Hunter"
// (X between words) is not season 10.
const ROMAN_SEASON_PATTERN = /\b(II|III|IV|V|VI|VII|VIII|IX|X)\b(?=\s*(?:[:([–—\-～~]|$))/i;
const ROMAN_SEASON_TRAILING_PAREN_PATTERN = /\b(II|III|IV|V|VI|VII|VIII|IX|X)\s*\(.*\)\s*$/i;
const SPECIAL_TITLE_PATTERN = /\b(?:ova|ona|oad|special|specials|movie|film)\b/i;

const AnimeSynonymsJsonSchema = Schema.fromJsonString(Schema.Array(Schema.String));

function parseSeasonNumber(match: RegExpMatchArray | null): number | undefined {
  const raw = match?.[1];
  if (raw === undefined) return undefined;
  const n = globalThis.Number(raw);
  return n >= 1 && n <= 99 ? n : undefined;
}

const FULLWIDTH_ROMAN: Record<string, string> = {
  Ⅱ: "II",
  Ⅲ: "III",
  Ⅳ: "IV",
  Ⅴ: "V",
  Ⅵ: "VI",
  Ⅶ: "VII",
  Ⅷ: "VIII",
  Ⅸ: "IX",
  Ⅹ: "X",
};

function normalizeRomanNumerals(value: string): string {
  return value.replace(/[ⅡⅢⅣⅤⅥⅦⅧⅨⅩ]/g, (ch) => FULLWIDTH_ROMAN[ch] ?? ch);
}

export function inferSeasonFromTitle(title: string | null | undefined): number | undefined {
  if (!title) return undefined;
  const value = normalizeRomanNumerals(title.trim());
  if (value.length === 0) return undefined;

  const ordinal = parseSeasonNumber(value.match(ORDINAL_SEASON_PATTERN));
  if (ordinal !== undefined) return ordinal;

  const longSeason = parseSeasonNumber(value.match(LONG_SEASON_PATTERN));
  if (longSeason !== undefined) return longSeason;

  // Split-cour Part/Cour markers denote the same season split, not a new
  // season, but for search filtering they behave like a season marker:
  // "Part 2" releases must not match "Part 1" media.
  const part = parseSeasonNumber(value.match(PART_COUR_PATTERN));
  if (part !== undefined) return part;

  const short = parseSeasonNumber(value.match(SHORT_SEASON_PATTERN));
  if (short !== undefined) return short;

  const romanMatch =
    value.match(ROMAN_SEASON_PATTERN) ?? value.match(ROMAN_SEASON_TRAILING_PAREN_PATTERN);
  if (romanMatch?.[1]) {
    const n = ROMAN_SEASON[romanMatch[1].toUpperCase()];
    if (n !== undefined) return n;
  }

  return undefined;
}

export function inferExpectedAnimeSeason(input: {
  readonly titleRomaji?: string | null;
  readonly titleEnglish?: string | null;
  readonly titleNative?: string | null;
  readonly synonyms?: readonly string[];
}): number | undefined {
  const titles: (string | null | undefined)[] = [
    input.titleRomaji,
    input.titleEnglish,
    input.titleNative,
    ...(input.synonyms ?? []),
  ];
  for (const title of titles) {
    const season = inferSeasonFromTitle(title);
    if (season !== undefined) return season;
  }
  return undefined;
}

export function getReleaseSeason(title: string): number | undefined {
  const result = parseReleaseSourceIdentity(title);
  const identity = result.source_identity;
  if (identity?.scheme === "season") return identity.season;
  return inferSeasonFromTitle(title);
}

function isSpecialLikeMedia(input: {
  readonly format?: string | null;
  readonly titleRomaji?: string | null;
  readonly titleEnglish?: string | null;
}): boolean {
  if (input.format && SPECIAL_FORMATS.has(input.format.toUpperCase())) return true;
  const titles = `${input.titleRomaji ?? ""} ${input.titleEnglish ?? ""}`.toLowerCase();
  return SPECIAL_TITLE_PATTERN.test(titles);
}

export function isAnimeReleaseSeasonMismatch(input: {
  readonly media: {
    readonly titleRomaji?: string | null;
    readonly titleEnglish?: string | null;
    readonly titleNative?: string | null;
    readonly synonyms?: readonly string[];
    readonly format?: string | null;
  };
  readonly releaseTitle: string;
}): boolean {
  const releaseSeason = getReleaseSeason(input.releaseTitle);

  if (releaseSeason === 0) {
    return !isSpecialLikeMedia(input.media);
  }

  const expected = inferExpectedAnimeSeason(input.media) ?? 1;
  // Absolute "- 14" releases carry no season marker. For season 1 media that
  // is normal; for sequels it is ambiguous per-season numbering that collides
  // across seasons (S1E14 vs S3E14) and must not match.
  if (releaseSeason === undefined || releaseSeason === null) return expected > 1;

  return releaseSeason !== expected;
}

export function decodeSynonyms(value: string | null | undefined): string[] {
  if (!value) return [];
  const result = Schema.decodeUnknownResult(AnimeSynonymsJsonSchema)(value);
  if (!Result.isSuccess(result)) return [];
  return result.success.filter((entry) => entry.trim().length > 0);
}
