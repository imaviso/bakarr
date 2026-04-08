import type {
  AniDbEpisodeLookupInput,
  AniDbEpisodeMetadata,
} from "@/features/anime/anidb-types.ts";

const ANIDB_MAX_TITLE_CANDIDATES = 8;

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
  const values = [title.romaji, title.english, title.native, ...(synonyms ?? [])]
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter((value) => value.length > 0);

  return [...new Set(values)].slice(0, ANIDB_MAX_TITLE_CANDIDATES);
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
