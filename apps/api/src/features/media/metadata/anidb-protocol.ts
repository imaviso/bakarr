const ANIDB_MAX_TITLE_CANDIDATES = 8;

export interface AniDbEpisodeLookupInput {
  readonly mediaId?: number | undefined;
  readonly unitCount?: number | null | undefined;
  readonly synonyms?: ReadonlyArray<string> | null | undefined;
  readonly title: {
    readonly english?: string | null | undefined;
    readonly native?: string | null | undefined;
    readonly romaji: string;
  };
}

export interface AniDbEpisodeMetadata {
  readonly aired?: string | undefined;
  readonly number: number;
  readonly title?: string | undefined;
}

export type AniDbLookupSkipReason =
  | "runtime_config_unavailable"
  | "disabled"
  | "missing_credentials"
  | "missing_title_candidates"
  | "title_not_found";

export type AniDbEpisodeLookupResult =
  | {
      readonly _tag: "AniDbLookupSuccess";
      readonly mediaUnits: ReadonlyArray<AniDbEpisodeMetadata>;
    }
  | {
      readonly _tag: "AniDbLookupSkipped";
      readonly reason: AniDbLookupSkipReason;
    };

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
  readonly tag: string | undefined;
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
    tag: parsed.tag,
  };
}

/** Extract only the echoed tag from a raw response — used to drop packets that belong to other requests. */
export function parseAniDbResponseTag(raw: string): string | undefined {
  return parseAniDbResponse(raw)?.tag;
}

export function parseAid(line: string | undefined): number | undefined {
  if (!line) {
    return undefined;
  }

  const aid = globalThis.Number.parseInt(line.split("|")[0] ?? "", 10);
  return globalThis.Number.isFinite(aid) && aid > 0 ? aid : undefined;
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

  // ANIME rows: aid|eps|ep count|special cnt|rating|votes|tmprating|tmpvotes|
  // review avg|reviews|year|type|romaji|kanji|english|other|short|synonyms|cats
  const title =
    normalizeAniDbText(fields[12]) ??
    normalizeAniDbText(fields[14]) ??
    normalizeAniDbText(fields[13]);

  return {
    aid,
    title,
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
  const type = globalThis.Number.parseInt(fields[10] ?? "1", 10);

  if (globalThis.Number.isFinite(type) && type !== 1) {
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
    ...(title.english == null
      ? []
      : [{ source: "english", value: title.english } satisfies AniDbTitleCandidate]),
    ...(title.native == null
      ? []
      : [{ source: "native", value: title.native } satisfies AniDbTitleCandidate]),
    ...(synonyms ?? []).map((value): AniDbTitleCandidate => ({ source: "synonym", value })),
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
  if (matchedTitle === undefined) {
    return sourcePriorityScore(candidate.source);
  }

  return scorePreNormalizedCandidate({
    candidateNormalized: normalizeTitleForMatch(candidate.value),
    candidateTokens: tokenizeNormalizedTitle(normalizeTitleForMatch(candidate.value)),
    source: candidate.source,
    titleNormalized: normalizeTitleForMatch(matchedTitle),
    titleTokens: tokenizeNormalizedTitle(normalizeTitleForMatch(matchedTitle)),
  });
}

export function tokenizeNormalizedTitle(normalized: string): ReadonlySet<string> {
  return new Set(normalized.split(" ").filter((token) => token.length > 0));
}

export function scorePreNormalizedCandidate(input: {
  readonly source: AniDbTitleCandidate["source"];
  readonly candidateNormalized: string;
  readonly candidateTokens: ReadonlySet<string>;
  readonly titleNormalized: string;
  readonly titleTokens: ReadonlySet<string>;
}): number {
  const sourceScore = sourcePriorityScore(input.source);

  if (input.candidateNormalized.length === 0 || input.titleNormalized.length === 0) {
    return sourceScore;
  }

  if (input.candidateNormalized === input.titleNormalized) {
    return sourceScore + 60;
  }

  if (
    input.candidateNormalized.includes(input.titleNormalized) ||
    input.titleNormalized.includes(input.candidateNormalized)
  ) {
    return sourceScore + 40;
  }

  return sourceScore + scoreTokenOverlapSets(input.candidateTokens, input.titleTokens);
}

function scoreTokenOverlapSets(
  candidateTokens: ReadonlySet<string>,
  matchedTokens: ReadonlySet<string>,
): number {
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

function parseAniDbHeader(
  header: string,
): { readonly code: number; readonly rest: string; readonly tag: string | undefined } | undefined {
  const withTag = header.match(/^(\S+)\s+(\d{3})\s*(.*)$/);

  if (withTag) {
    return {
      code: globalThis.Number.parseInt(withTag[2] ?? "", 10),
      rest: withTag[3] ?? "",
      tag: withTag[1],
    };
  }

  const withoutTag = header.match(/^(\d{3})\s*(.*)$/);

  if (!withoutTag) {
    return undefined;
  }

  return {
    code: globalThis.Number.parseInt(withoutTag[1] ?? "", 10),
    rest: withoutTag[2] ?? "",
    tag: undefined,
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

  const number = globalThis.Number.parseInt(normalized, 10);
  return globalThis.Number.isFinite(number) && number > 0 ? number : undefined;
}

function toIsoFromUnix(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const unixSeconds = globalThis.Number.parseInt(value, 10);

  if (!globalThis.Number.isFinite(unixSeconds) || unixSeconds <= 0) {
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

export function normalizeTitleForMatch(value: string) {
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

  return 0;
}
