import { parseReleaseSourceIdentity } from "@/features/media/identity/identity.ts";

const ROMAN_SEASON: Record<string, number> = {
  II: 2,
  III: 3,
  IV: 4,
  V: 5,
  VI: 6,
};

const SPECIAL_FORMATS = new Set(["OVA", "ONA", "OAD", "SPECIAL", "MOVIE"]);

export function inferSeasonFromTitle(title: string | null | undefined): number | undefined {
  if (!title) return undefined;
  const value = title.trim();
  if (value.length === 0) return undefined;

  const ordinal = value.match(/(\d{1,2})(?:st|nd|rd|th)\s+season\b/i);
  if (ordinal?.[1]) {
    const n = Number(ordinal[1]);
    if (n >= 1 && n <= 99) return n;
  }

  const longSeason = value.match(/\bseason\s+(\d{1,2})\b/i);
  if (longSeason?.[1]) {
    const n = Number(longSeason[1]);
    if (n >= 1 && n <= 99) return n;
  }

  const part = value.match(/\b(?:part|cour)\s+(\d{1,2})\b/i);
  if (part?.[1]) {
    const n = Number(part[1]);
    if (n >= 1 && n <= 99) return n;
  }

  const roman = value.match(/\b(II|III|IV|V|VI)\s*(?:\(.*\))?\s*$/i);
  if (roman?.[1]) {
    const n = ROMAN_SEASON[roman[1].toUpperCase()];
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
  if (!identity || identity.scheme !== "season") return undefined;
  return identity.season;
}

function isSpecialLikeMedia(input: {
  readonly format?: string | null;
  readonly titleRomaji?: string | null;
  readonly titleEnglish?: string | null;
}): boolean {
  if (input.format && SPECIAL_FORMATS.has(input.format.toUpperCase())) return true;
  const titles = `${input.titleRomaji ?? ""} ${input.titleEnglish ?? ""}`.toLowerCase();
  return /\b(?:ova|ona|oad|special|specials|movie)\b/i.test(titles);
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
  readonly releaseSeason?: number | null;
}): boolean {
  const releaseSeason = input.releaseSeason ?? getReleaseSeason(input.releaseTitle);
  if (releaseSeason === undefined || releaseSeason === null) return false;

  if (releaseSeason === 0) {
    return !isSpecialLikeMedia(input.media);
  }

  const expected = inferExpectedAnimeSeason(input.media) ?? 1;
  return releaseSeason !== expected;
}

export function decodeSynonyms(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (entry): entry is string => typeof entry === "string" && entry.trim().length > 0,
    );
  } catch {
    return [];
  }
}
