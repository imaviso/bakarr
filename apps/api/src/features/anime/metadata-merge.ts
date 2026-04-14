import type { AnimeDiscoveryEntry } from "@packages/shared/index.ts";
import type { AnimeMetadata } from "@/features/anime/anilist-model.ts";
import type { JikanNormalizedAnime } from "@/features/anime/jikan-model.ts";
import type { ManamiAnimeEntry } from "@/features/anime/manami-model.ts";
import { extractYearFromDate } from "@/lib/anime-date-utils.ts";

type JikanRelationTarget = JikanNormalizedAnime["relations"][number];
type JikanRecommendationTarget = NonNullable<JikanNormalizedAnime["recommendations"]>[number];

export interface MetadataMergeInput {
  readonly anilist: AnimeMetadata;
  readonly jikan?: JikanNormalizedAnime;
  readonly manami?: ManamiAnimeEntry;
  readonly malToAniListId?: ReadonlyMap<number, number>;
}

export function mergeAnimeMetadata(input: MetadataMergeInput): AnimeMetadata {
  const { anilist, jikan, manami, malToAniListId } = input;
  const relationMap = malToAniListId ?? new Map<number, number>();
  const startDate = fillDate(anilist.startDate, jikan?.startDate);
  const endDate = fillDate(anilist.endDate, jikan?.endDate);
  const jikanRelationEntries = convertJikanRelationsToDiscoveryEntries(
    jikan?.relations,
    relationMap,
  );
  const jikanRecommendationEntries = convertJikanRecommendationsToDiscoveryEntries(
    jikan?.recommendations,
    relationMap,
  );

  return {
    ...anilist,
    background: pickFirst(anilist.background, jikan?.background),
    description: pickFirst(anilist.description, jikan?.synopsis, jikan?.background),
    duration: pickFirst(anilist.duration, jikan?.duration),
    endDate,
    endYear: anilist.endYear ?? jikan?.endYear ?? extractYearFromDate(endDate),
    episodeCount: anilist.episodeCount ?? jikan?.episodeCount,
    favorites: anilist.favorites ?? jikan?.favorites,
    format: fillFormat(anilist.format, jikan?.format),
    genres: mergeGenres(anilist.genres, jikan?.genres, manami?.tags),
    id: anilist.id,
    members: anilist.members ?? jikan?.members,
    popularity: anilist.popularity ?? jikan?.popularity,
    rank: anilist.rank ?? jikan?.rank,
    rating: pickFirst(anilist.rating, jikan?.rating),
    score: mergeScore(anilist.score, jikan?.score),
    source: pickFirst(anilist.source, jikan?.source),
    startDate,
    startYear: anilist.startYear ?? jikan?.startYear ?? extractYearFromDate(startDate),
    status: fillStatus(anilist.status, jikan?.status),
    studios: mergeStudios(anilist.studios, jikan?.studios, manami?.studios),
    synonyms: mergeSynonyms(anilist.synonyms, jikan?.titleVariants, manami?.synonyms),
    title: mergeTitle(anilist, jikan, manami),
    recommendedAnime: mergeDiscoveryEntries(
      mergeDiscoveryEntries(anilist.recommendedAnime, jikanRecommendationEntries),
      jikanRelationEntries,
    ),
    relatedAnime: mergeDiscoveryEntries(anilist.relatedAnime, jikanRelationEntries),
  };
}

export function mergeTitle(
  anilist: Pick<AnimeMetadata, "title">,
  jikan?: Pick<JikanNormalizedAnime, "title" | "titleVariants">,
  manami?: Pick<ManamiAnimeEntry, "title" | "synonyms">,
): AnimeMetadata["title"] {
  const fallback = deriveManamiTitleFallback(manami);

  return {
    romaji: anilist.title.romaji,
    english: pickFirst(anilist.title.english, jikan?.title.english, fallback.english),
    native: pickFirst(anilist.title.native, jikan?.title.native, fallback.native),
  };
}

export function mergeSynonyms(
  anilistSynonyms?: ReadonlyArray<string>,
  jikanTitleVariants?: ReadonlyArray<string>,
  manamiSynonyms?: ReadonlyArray<string>,
) {
  return mergeStringGroups(anilistSynonyms, jikanTitleVariants, manamiSynonyms);
}

export function mergeGenres(
  anilistGenres?: ReadonlyArray<string>,
  jikanGenres?: ReadonlyArray<string>,
  manamiTags?: ReadonlyArray<string>,
) {
  return mergeStringGroups(anilistGenres, jikanGenres, manamiTags);
}

export function mergeStudios(
  anilistStudios?: ReadonlyArray<string>,
  jikanStudios?: ReadonlyArray<string>,
  manamiStudios?: ReadonlyArray<string>,
) {
  const normalizedAniListStudios = normalizeStringList(anilistStudios);
  if (normalizedAniListStudios.length > 0) {
    return normalizedAniListStudios;
  }

  const normalizedJikanStudios = normalizeStringList(jikanStudios);
  if (normalizedJikanStudios.length > 0) {
    return normalizedJikanStudios;
  }

  const normalizedManamiStudios = normalizeStringList(manamiStudios);
  return normalizedManamiStudios.length > 0 ? normalizedManamiStudios : undefined;
}

export function mergeScore(anilistScore?: number, jikanScore?: number) {
  if (anilistScore !== undefined) {
    return anilistScore;
  }

  return scaleJikanScoreToAniList(jikanScore);
}

export function scaleJikanScoreToAniList(jikanScore?: number) {
  if (jikanScore === undefined) {
    return undefined;
  }

  const scaled = Math.round(jikanScore * 10);
  return clampInteger(scaled, 1, 100);
}

export function convertJikanRelationsToDiscoveryEntries(
  relations: ReadonlyArray<JikanRelationTarget> | undefined,
  malToAniListId: ReadonlyMap<number, number>,
): AnimeDiscoveryEntry[] {
  if (!relations || relations.length === 0) {
    return [];
  }

  const output: AnimeDiscoveryEntry[] = [];
  const seen = new Set<number>();

  for (const relation of relations) {
    const animeId = malToAniListId.get(relation.malId);
    if (animeId === undefined || seen.has(animeId)) {
      continue;
    }

    seen.add(animeId);
    output.push({
      id: animeId,
      relation_type: relation.relation,
      title: {
        romaji: normalizeString(relation.title),
      },
    });
  }

  return output;
}

export function convertJikanRecommendationsToDiscoveryEntries(
  recommendations: ReadonlyArray<JikanRecommendationTarget> | undefined,
  malToAniListId: ReadonlyMap<number, number>,
): AnimeDiscoveryEntry[] {
  if (!recommendations || recommendations.length === 0) {
    return [];
  }

  const output: AnimeDiscoveryEntry[] = [];
  const seen = new Set<number>();

  for (const recommendation of recommendations) {
    const animeId = malToAniListId.get(recommendation.malId);
    if (animeId === undefined || seen.has(animeId)) {
      continue;
    }

    seen.add(animeId);
    output.push({
      id: animeId,
      title: {
        romaji: normalizeString(recommendation.title),
      },
    });
  }

  return output;
}

export function mergeDiscoveryEntries(
  base: ReadonlyArray<AnimeDiscoveryEntry> | undefined,
  appended: ReadonlyArray<AnimeDiscoveryEntry>,
) {
  const out = base ? [...base] : [];
  const seen = new Set<number>(out.map((entry) => entry.id));

  for (const entry of appended) {
    if (seen.has(entry.id)) {
      continue;
    }

    seen.add(entry.id);
    out.push(entry);
  }

  if (!base && out.length === 0) {
    return undefined;
  }

  return out;
}

function deriveManamiTitleFallback(manami?: Pick<ManamiAnimeEntry, "title" | "synonyms">): {
  english?: string;
  native?: string;
} {
  const candidates = normalizeStringList([manami?.title, ...(manami?.synonyms ?? [])]);
  if (candidates.length === 0) {
    return {};
  }

  const englishCandidate = candidates.find((value) => isMostlyLatin(value));
  const nativeCandidate = candidates.find((value) => !isMostlyLatin(value));
  const first = candidates[0]!;

  const english = englishCandidate ?? first;
  const native = nativeCandidate ?? first;

  return { english, native };
}

function mergeStringGroups(
  ...groups: ReadonlyArray<ReadonlyArray<string> | undefined>
): string[] | undefined {
  const values = normalizeStringList(groups.flatMap((group) => group ?? []));
  return values.length > 0 ? values : undefined;
}

function normalizeStringList(values: ReadonlyArray<string | undefined> | undefined): string[] {
  const output: string[] = [];
  const seen = new Set<string>();

  for (const value of values ?? []) {
    const normalized = normalizeString(value);
    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    output.push(normalized);
  }

  return output;
}

function pickFirst(...values: ReadonlyArray<string | undefined>) {
  for (const value of values) {
    const normalized = normalizeString(value);
    if (normalized) {
      return normalized;
    }
  }

  return undefined;
}

function fillRequiredString(primary: string, fallback?: string) {
  const preferred = normalizeString(primary);
  if (preferred) {
    return preferred;
  }

  const resolvedFallback = normalizeString(fallback);
  return resolvedFallback ?? primary;
}

function fillDate(primary?: string, fallback?: string) {
  return primary ?? fallback;
}

function fillStatus(primary: string, fallback?: string) {
  return fillRequiredString(primary, fallback);
}

function fillFormat(primary: string, fallback?: string) {
  return fillRequiredString(primary, fallback);
}

function normalizeString(value: string | undefined) {
  if (value === undefined) {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function isMostlyLatin(value: string) {
  return /^[\p{Script=Latin}\p{M}\p{N}\p{P}\p{Zs}]+$/u.test(value);
}

function clampInteger(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
