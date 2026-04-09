import type {
  AniDbEpisodeLookupInput,
  AniDbEpisodeMetadata,
} from "@/features/anime/anidb-types.ts";

const ANIDB_MAX_TITLE_CANDIDATES = 8;

export type AniDbTitleCandidateSource = "romaji" | "english" | "native" | "synonym";

export interface AniDbTitleCandidate {
  readonly source: AniDbTitleCandidateSource;
  readonly value: string;
}

export interface AniDbAnimeLookupMatch {
  readonly aid: number;
  readonly title: string | undefined;
}

export interface AniDbResponse {
  readonly code: number;
  readonly lines: ReadonlyArray<string>;
  readonly rest: string;
}

export function parseAniDbResponse(raw: string): AniDbResponse | undefined {
  const lines = raw
    .replaceAll("\r", "")
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0);

  if (lines.length === 0) {
    return undefined;
  }

  const header = lines[0];

  if (!header) {
    return undefined;
  }

  const parsed = parseAniDbHeader(header);

  if (!parsed) {
    return undefined;
  }

  return {
    code: parsed.code,
    lines: lines.slice(1),
    rest: parsed.rest,
  };
}

export function parseAid(line: string | undefined): number | undefined {
  if (!line) {
    return undefined;
  }

  const aid = Number.parseInt(line.split("|")[0] ?? "", 10);
  return Number.isFinite(aid) && aid > 0 ? aid : undefined;
}

export function parseAnimeLookupMatch(line: string | undefined): AniDbAnimeLookupMatch | undefined {
  if (!line) {
    return undefined;
  }

  const fields = line.split("|");
  const aid = parseAid(line);

  if (aid === undefined) {
    return undefined;
  }

  return {
    aid,
    title: normalizeAniDbText(fields[1]),
  };
}

export function parseEpisodeResponse(
  line: string | undefined,
  fallbackEpisodeNumber: number,
): AniDbEpisodeMetadata | undefined {
  if (!line) {
    return undefined;
  }

  const fields = line.split("|");
  const type = Number.parseInt(fields[10] ?? "1", 10);

  if (Number.isFinite(type) && type !== 1) {
    return undefined;
  }

  const parsedEpisodeNumber = parseEpisodeNumber(fields[5]) ?? fallbackEpisodeNumber;
  const title = [fields[6], fields[7], fields[8]].map(normalizeAniDbText).find((value) => value);
  const aired = toIsoFromUnix(fields[9]);

  return {
    ...(aired === undefined ? {} : { aired }),
    number: parsedEpisodeNumber,
    ...(title === undefined ? {} : { title }),
  };
}

export function buildTitleCandidates(
  title: AniDbEpisodeLookupInput["title"],
  synonyms: ReadonlyArray<string> | undefined,
) {
  const candidates: ReadonlyArray<AniDbTitleCandidate> = [
    { source: "romaji", value: title.romaji },
    ...(title.english === undefined ? [] : [{ source: "english", value: title.english } as const]),
    ...(title.native === undefined ? [] : [{ source: "native", value: title.native } as const]),
    ...(synonyms ?? []).map((value) => ({ source: "synonym", value }) as const),
  ];

  const dedupedCandidates = new Map<string, AniDbTitleCandidate>();

  for (const candidate of candidates) {
    const normalizedValue = candidate.value.trim();

    if (normalizedValue.length === 0) {
      continue;
    }

    const dedupeKey = normalizeTitleForMatch(normalizedValue);

    if (!dedupedCandidates.has(dedupeKey)) {
      dedupedCandidates.set(dedupeKey, {
        source: candidate.source,
        value: normalizedValue,
      });
    }
  }

  return Array.from(dedupedCandidates.values()).slice(0, ANIDB_MAX_TITLE_CANDIDATES);
}

export function scoreAnimeLookupCandidate(
  candidate: AniDbTitleCandidate,
  matchedTitle: string | undefined,
) {
  const sourceScore = sourcePriorityScore(candidate.source);

  if (matchedTitle === undefined) {
    return sourceScore;
  }

  const candidateNormalized = normalizeTitleForMatch(candidate.value);
  const matchedNormalized = normalizeTitleForMatch(matchedTitle);

  if (candidateNormalized.length === 0 || matchedNormalized.length === 0) {
    return sourceScore;
  }

  if (candidateNormalized === matchedNormalized) {
    return sourceScore + 60;
  }

  if (
    candidateNormalized.includes(matchedNormalized) ||
    matchedNormalized.includes(candidateNormalized)
  ) {
    return sourceScore + 40;
  }

  return sourceScore + scoreTokenOverlap(candidateNormalized, matchedNormalized);
}

function parseAniDbHeader(
  header: string,
): { readonly code: number; readonly rest: string } | undefined {
  const withTag = header.match(/^\S+\s+(\d{3})\s*(.*)$/);

  if (withTag) {
    return {
      code: Number.parseInt(withTag[1] ?? "", 10),
      rest: withTag[2] ?? "",
    };
  }

  const withoutTag = header.match(/^(\d{3})\s*(.*)$/);

  if (!withoutTag) {
    return undefined;
  }

  return {
    code: Number.parseInt(withoutTag[1] ?? "", 10),
    rest: withoutTag[2] ?? "",
  };
}

function parseEpisodeNumber(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }

  const normalized = value.trim();

  if (!/^\d+$/.test(normalized)) {
    return undefined;
  }

  const number = Number.parseInt(normalized, 10);
  return Number.isFinite(number) && number > 0 ? number : undefined;
}

function toIsoFromUnix(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const unixSeconds = Number.parseInt(value, 10);

  if (!Number.isFinite(unixSeconds) || unixSeconds <= 0) {
    return undefined;
  }

  return new Date(unixSeconds * 1000).toISOString();
}

function normalizeAniDbText(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();

  if (trimmed.length === 0) {
    return undefined;
  }

  return trimmed.replaceAll("<br />", "\n").replaceAll("`", "'");
}

function normalizeTitleForMatch(value: string) {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/gu, " ");
}

function sourcePriorityScore(source: AniDbTitleCandidateSource) {
  switch (source) {
    case "romaji":
      return 40;
    case "english":
      return 34;
    case "native":
      return 30;
    case "synonym":
      return 24;
  }
}

function scoreTokenOverlap(candidate: string, matched: string) {
  const candidateTokens = new Set(candidate.split(" ").filter((token) => token.length > 0));
  const matchedTokens = new Set(matched.split(" ").filter((token) => token.length > 0));

  if (candidateTokens.size === 0 || matchedTokens.size === 0) {
    return 0;
  }

  let shared = 0;
  for (const token of candidateTokens) {
    if (matchedTokens.has(token)) {
      shared += 1;
    }
  }

  if (shared === 0) {
    return 0;
  }

  return Math.round((shared / Math.max(candidateTokens.size, matchedTokens.size)) * 30);
}
