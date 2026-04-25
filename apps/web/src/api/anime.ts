import {
  infiniteQueryOptions,
  keepPreviousData,
  queryOptions,
  useInfiniteQuery,
  useQuery,
} from "@tanstack/react-query";
import type { Anime, AnimeSeason } from "./contracts";
import {
  AnimeListResponseSchema,
  AnimeSchema,
  AnimeSearchResponseSchema,
  AnimeSearchResultSchema,
  EpisodeSchema,
  EpisodeSearchResultSchema,
  SeasonalAnimeResponseSchema,
  SearchResultsSchema,
  VideoFileSchema,
} from "@bakarr/shared";
import { Effect, Schema } from "effect";
import { API_BASE } from "~/api";
import { fetchJson } from "~/api/effect/api-client";
import { animeKeys } from "./keys";

export function animeListQueryOptions() {
  return queryOptions({
    queryKey: animeKeys.lists(),
    queryFn: async ({ signal }) => {
      const pageLimit = 500;

      const res = await Effect.runPromise(
        fetchJson(
          AnimeListResponseSchema,
          `${API_BASE}/anime?limit=${pageLimit}&offset=0`,
          undefined,
          signal,
        ),
      );

      const items: Anime[] = [...res.items];

      if (res.has_more && res.items.length > 0) {
        const remainingPromises: Promise<void>[] = [];
        let offset = res.items.length;
        while (offset < pageLimit * 10) {
          remainingPromises.push(
            Effect.runPromise(
              fetchJson(
                AnimeListResponseSchema,
                `${API_BASE}/anime?limit=${pageLimit}&offset=${offset}`,
                undefined,
                signal,
              ),
            ).then((page) => {
              items.push(...page.items);
              if (!page.has_more || page.items.length === 0) return;
              offset += page.items.length;
              return;
            }),
          );
          offset += pageLimit;
        }
        await Promise.all(remainingPromises);
      }

      return items;
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

export function createAnimeListQuery(options?: { enabled?: boolean }) {
  return useQuery({
    ...animeListQueryOptions(),
    ...(options?.enabled === undefined ? {} : { enabled: options.enabled }),
  });
}

export function animeDetailsQueryOptions(id: number) {
  return queryOptions({
    queryKey: animeKeys.detail(id),
    queryFn: ({ signal }) =>
      Effect.runPromise(fetchJson(AnimeSchema, `${API_BASE}/anime/${id}`, undefined, signal)),
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

export function createAnimeDetailsQuery(id: number) {
  return useQuery({
    ...animeDetailsQueryOptions(id),
    enabled: !!id,
  });
}

export function episodesQueryOptions(animeId: number) {
  return queryOptions({
    queryKey: animeKeys.episodes(animeId),
    queryFn: ({ signal }) =>
      Effect.runPromise(
        fetchJson(
          Schema.Array(EpisodeSchema),
          `${API_BASE}/anime/${animeId}/episodes`,
          undefined,
          signal,
        ),
      ),
    staleTime: 1000 * 60 * 5,
  });
}

export function createEpisodesQuery(animeId: number) {
  return useQuery({
    ...episodesQueryOptions(animeId),
    enabled: !!animeId,
  });
}

export function listFilesQueryOptions(animeId: number) {
  return queryOptions({
    queryKey: animeKeys.files(animeId),
    queryFn: ({ signal }) =>
      Effect.runPromise(
        fetchJson(
          Schema.Array(VideoFileSchema),
          `${API_BASE}/anime/${animeId}/files`,
          undefined,
          signal,
        ),
      ),
    staleTime: 1000 * 60,
  });
}

export function createListFilesQuery(animeId: number, options?: { enabled?: boolean }) {
  return useQuery({
    ...listFilesQueryOptions(animeId),
    enabled: !!animeId && (options?.enabled ?? true),
  });
}

export function animeSearchQueryOptions(query: string) {
  return queryOptions({
    queryKey: animeKeys.search.query(query),
    queryFn: ({ signal }) =>
      Effect.runPromise(
        fetchJson(
          AnimeSearchResponseSchema,
          `${API_BASE}/anime/search?q=${encodeURIComponent(query)}`,
          undefined,
          signal,
        ),
      ),
    staleTime: 1000 * 60 * 60, // 1 hour
  });
}

export function createAnimeSearchQuery(query: string) {
  const normalizedQuery = query.trim();

  return useQuery({
    ...animeSearchQueryOptions(normalizedQuery),
    enabled: normalizedQuery.length >= 3,
  });
}

export function episodeSearchQueryOptions(animeId: number, episodeNumber: number) {
  return queryOptions({
    queryKey: animeKeys.search.episode(animeId, episodeNumber),
    queryFn: ({ signal }) =>
      Effect.runPromise(
        fetchJson(
          Schema.Array(EpisodeSearchResultSchema),
          `${API_BASE}/search/episode/${animeId}/${episodeNumber}`,
          undefined,
          signal,
        ),
      ),
  });
}

export function createEpisodeSearchQuery(animeId: number, episodeNumber: number, enabled = false) {
  return useQuery({
    ...episodeSearchQueryOptions(animeId, episodeNumber),
    enabled,
  });
}

export function nyaaSearchQueryOptions(
  query: string,
  options: {
    animeId?: number;
    category?: string;
    filter?: string;
  } = {},
) {
  const queryKeyOptions = {
    ...(options.animeId === undefined ? {} : { animeId: options.animeId }),
    ...(options.category === undefined ? {} : { category: options.category }),
    ...(options.filter === undefined ? {} : { filter: options.filter }),
  };

  return queryOptions({
    queryKey: animeKeys.search.releases(query, queryKeyOptions),
    queryFn: ({ signal }) => {
      const params = new URLSearchParams();
      params.append("query", query);
      if (options.animeId) {
        params.append("anime_id", options.animeId.toString());
      }
      if (options.category) params.append("category", options.category);
      if (options.filter) params.append("filter", options.filter);
      return Effect.runPromise(
        fetchJson(
          SearchResultsSchema,
          `${API_BASE}/search/releases?${params.toString()}`,
          undefined,
          signal,
        ),
      );
    },
    staleTime: 60 * 1000,
  });
}

export function createNyaaSearchQuery(
  query: string,
  options: {
    animeId?: number | undefined;
    category?: string | undefined;
    filter?: string | undefined;
    enabled?: boolean | undefined;
  } = {},
) {
  const normalizedQuery = query.trim();

  return useQuery({
    ...nyaaSearchQueryOptions(normalizedQuery, {
      ...(options.animeId === undefined ? {} : { animeId: options.animeId }),
      ...(options.category === undefined ? {} : { category: options.category }),
      ...(options.filter === undefined ? {} : { filter: options.filter }),
    }),
    enabled: (options.enabled ?? true) && normalizedQuery.length > 0,
  });
}

export function animeByAnilistIdQueryOptions(id: number) {
  return queryOptions({
    queryKey: animeKeys.anilist(id),
    queryFn: ({ signal }) =>
      Effect.runPromise(
        fetchJson(AnimeSearchResultSchema, `${API_BASE}/anime/anilist/${id}`, undefined, signal),
      ),
    staleTime: 1000 * 60 * 60,
  });
}

export function createAnimeByAnilistIdQuery(id: number | null) {
  return useQuery({
    ...animeByAnilistIdQueryOptions(id ?? 0),
    enabled: id !== null && id > 0,
  });
}

export function seasonalAnimeQueryOptions(input?: {
  season?: AnimeSeason;
  year?: number;
  limit?: number;
  page?: number;
}) {
  const season = input?.season;
  const year = input?.year;
  const limit = input?.limit ?? 12;
  const page = input?.page ?? 1;

  const params = new URLSearchParams();
  if (season !== undefined) params.append("season", season);
  if (year !== undefined) params.append("year", String(year));
  params.append("limit", String(limit));
  params.append("page", String(page));

  return queryOptions({
    queryKey: animeKeys.seasonal({ season, year, limit, page }),
    queryFn: ({ signal }) =>
      Effect.runPromise(
        fetchJson(
          SeasonalAnimeResponseSchema,
          `${API_BASE}/anime/seasonal?${params.toString()}`,
          undefined,
          signal,
        ),
      ),
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

export function createSeasonalAnimeQuery(input?: {
  season?: AnimeSeason;
  year?: number;
  limit?: number;
  page?: number;
}) {
  return useQuery({
    ...seasonalAnimeQueryOptions(input),
  });
}

export function seasonalAnimeInfiniteQueryOptions(input?: {
  season?: AnimeSeason;
  year?: number;
  limit?: number;
}) {
  const season = input?.season;
  const year = input?.year;
  const limit = input?.limit ?? 25;

  return infiniteQueryOptions({
    queryKey: [
      "anime",
      "seasonal",
      "infinite",
      { season: season ?? null, year: year ?? null, limit },
    ] as const,
    queryFn: ({ pageParam, signal }) => {
      const params = new URLSearchParams();
      if (season !== undefined) params.append("season", season);
      if (year !== undefined) params.append("year", String(year));
      params.append("limit", String(limit));
      params.append("page", String(pageParam));
      return Effect.runPromise(
        fetchJson(
          SeasonalAnimeResponseSchema,
          `${API_BASE}/anime/seasonal?${params.toString()}`,
          undefined,
          signal,
        ),
      );
    },
    getNextPageParam: (lastPage) => (lastPage.has_more ? lastPage.page + 1 : undefined),
    initialPageParam: 1,
    placeholderData: keepPreviousData,
    staleTime: 1000 * 60 * 5,
  });
}

export function createSeasonalAnimeInfiniteQuery(input?: {
  season?: AnimeSeason;
  year?: number;
  limit?: number;
  enabled?: boolean;
}) {
  return useInfiniteQuery({
    ...seasonalAnimeInfiniteQueryOptions(input),
    enabled: input?.enabled ?? true,
  });
}
