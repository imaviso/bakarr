import { brandMediaId, type MediaDiscoveryEntry } from "@packages/shared/index.ts";
import type { AnimeMetadata } from "@/features/media/metadata/metadata-model.ts";
import { scaleTenraiScoreToAniList } from "@/features/media/metadata/tenrai-model.ts";
import type { TenraiNormalizedAnime } from "@/features/media/metadata/tenrai-model.ts";
import { extractYearFromDate } from "@/features/media/shared/date-utils.ts";

type TenraiRelationTarget = TenraiNormalizedAnime["relations"][number];
type TenraiRecommendationTarget = NonNullable<TenraiNormalizedAnime["recommendations"]>[number];

export interface MetadataMergeInput {
  readonly anilist: AnimeMetadata;
  readonly tenrai?: TenraiNormalizedAnime;
  readonly malToAniListId?: ReadonlyMap<number, number>;
}

export function mergeAnimeMetadata(input: MetadataMergeInput): AnimeMetadata {
  const { anilist, tenrai, malToAniListId } = input;
  const relationMap = malToAniListId ?? new Map<number, number>();
  const startDate = fillDate(anilist.startDate, tenrai?.startDate);
  const endDate = fillDate(anilist.endDate, tenrai?.endDate);
  const tenraiRelationEntries = convertTenraiRelationsToDiscoveryEntries(
    tenrai?.relations,
    relationMap,
  );
  const tenraiRecommendationEntries = convertTenraiRecommendationsToDiscoveryEntries(
    tenrai?.recommendations,
    relationMap,
  );

  return {
    ...anilist,
    background: pickFirst(anilist.background, tenrai?.background),
    description: pickFirst(anilist.description, tenrai?.synopsis, tenrai?.background),
    duration: pickFirst(anilist.duration, tenrai?.duration),
    endDate,
    endYear: anilist.endYear ?? tenrai?.endYear ?? extractYearFromDate(endDate),
    unitCount: anilist.unitCount ?? tenrai?.unitCount,
    favorites: anilist.favorites ?? tenrai?.favorites,
    format: fillFormat(anilist.format, tenrai?.format),
    genres: mergeGenres(anilist.genres, tenrai?.genres),
    id: anilist.id,
    members: anilist.members ?? tenrai?.members,
    popularity: anilist.popularity ?? tenrai?.popularity,
    rank: anilist.rank ?? tenrai?.rank,
    rating: pickFirst(anilist.rating, tenrai?.rating),
    score: mergeScore(anilist.score, tenrai?.score),
    source: pickFirst(anilist.source, tenrai?.source),
    startDate,
    startYear: anilist.startYear ?? tenrai?.startYear ?? extractYearFromDate(startDate),
    status: fillStatus(anilist.status, tenrai?.status),
    studios: mergeStudios(anilist.studios, tenrai?.studios),
    synonyms: mergeSynonyms(anilist.synonyms, tenrai?.titleVariants),
    title: mergeTitle(anilist, tenrai),
    recommendedMedia: mergeDiscoveryEntries(
      mergeDiscoveryEntries(anilist.recommendedMedia, tenraiRecommendationEntries),
      tenraiRelationEntries,
    ),
    relatedMedia: mergeDiscoveryEntries(anilist.relatedMedia, tenraiRelationEntries),
  };
}

export function mergeTitle(
  anilist: Pick<AnimeMetadata, "title">,
  tenrai?: Pick<TenraiNormalizedAnime, "title" | "titleVariants">,
): AnimeMetadata["title"] {
  return {
    romaji: anilist.title.romaji,
    english: pickFirst(anilist.title.english, tenrai?.title.english),
    native: pickFirst(anilist.title.native, tenrai?.title.native),
  };
}

export function mergeSynonyms(
  anilistSynonyms?: ReadonlyArray<string>,
  tenraiTitleVariants?: ReadonlyArray<string>,
) {
  return mergeStringGroups(anilistSynonyms, tenraiTitleVariants);
}

export function mergeGenres(
  anilistGenres?: ReadonlyArray<string>,
  tenraiGenres?: ReadonlyArray<string>,
) {
  return mergeStringGroups(anilistGenres, tenraiGenres);
}

export function mergeStudios(
  anilistStudios?: ReadonlyArray<string>,
  tenraiStudios?: ReadonlyArray<string>,
) {
  const normalizedAniListStudios = normalizeStringList(anilistStudios);
  if (normalizedAniListStudios.length > 0) {
    return normalizedAniListStudios;
  }

  const normalizedTenraiStudios = normalizeStringList(tenraiStudios);
  if (normalizedTenraiStudios.length > 0) {
    return normalizedTenraiStudios;
  }

  return undefined;
}

export function mergeScore(anilistScore?: number, tenraiScore?: number) {
  if (anilistScore !== undefined) {
    return anilistScore;
  }

  return scaleTenraiScoreToAniList(tenraiScore);
}

export function convertTenraiRelationsToDiscoveryEntries(
  relations: ReadonlyArray<TenraiRelationTarget> | undefined,
  malToAniListId: ReadonlyMap<number, number>,
): MediaDiscoveryEntry[] {
  if (!relations || relations.length === 0) {
    return [];
  }

  const output: MediaDiscoveryEntry[] = [];
  const seen = new Set<number>();

  for (const relation of relations) {
    const mediaId = malToAniListId.get(relation.malId);
    if (mediaId === undefined || seen.has(mediaId)) {
      continue;
    }

    seen.add(mediaId);
    output.push({
      id: brandMediaId(mediaId),
      relation_type: relation.relation,
      title: {
        romaji: normalizeString(relation.title),
      },
    });
  }

  return output;
}

export function convertTenraiRecommendationsToDiscoveryEntries(
  recommendations: ReadonlyArray<TenraiRecommendationTarget> | undefined,
  malToAniListId: ReadonlyMap<number, number>,
): MediaDiscoveryEntry[] {
  if (!recommendations || recommendations.length === 0) {
    return [];
  }

  const output: MediaDiscoveryEntry[] = [];
  const seen = new Set<number>();

  for (const recommendation of recommendations) {
    const mediaId = malToAniListId.get(recommendation.malId);
    if (mediaId === undefined || seen.has(mediaId)) {
      continue;
    }

    seen.add(mediaId);
    output.push({
      id: brandMediaId(mediaId),
      title: {
        romaji: normalizeString(recommendation.title),
      },
    });
  }

  return output;
}

export function mergeDiscoveryEntries(
  base: ReadonlyArray<MediaDiscoveryEntry> | undefined,
  appended: ReadonlyArray<MediaDiscoveryEntry>,
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

function mergeStringGroups(
  ...groups: ReadonlyArray<ReadonlyArray<string> | undefined>
): string[] | undefined {
  const values = normalizeStringList(groups.flatMap((group) => group ?? []));
  return values.length > 0 ? values : undefined;
}

function normalizeStringList(
  values: ReadonlyArray<string | null | undefined> | null | undefined,
): string[] {
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

function pickFirst(...values: ReadonlyArray<string | null | undefined>) {
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

function normalizeString(value: string | null | undefined) {
  if (value === undefined || value === null) {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}
