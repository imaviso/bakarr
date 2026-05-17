import {
  infiniteQueryOptions,
  keepPreviousData,
  queryOptions,
  useInfiniteQuery,
  useQuery,
} from "@tanstack/react-query";
import type { Media, MediaSeason, MediaKind } from "./contracts";
import {
  MediaListResponseSchema,
  MediaSchema,
  MediaSearchResponseSchema,
  MediaSearchResultSchema,
  MediaUnitSchema,
  UnitSearchResultSchema,
  SeasonalMediaResponseSchema,
  SearchResultsSchema,
  VideoFileSchema,
} from "@bakarr/shared";
import { Effect, Schema } from "effect";
import { API_BASE } from "~/api/constants";
import { fetchJson } from "~/api/effect/api-client";
import { animeKeys } from "./keys";

export function mediaListQueryOptions() {
  return queryOptions({
    queryKey: animeKeys.lists(),
    queryFn: async ({ signal }) => {
      const pageLimit = 500;
      const items: Media[] = [];
      let offset = 0;

      while (true) {
        const page = await Effect.runPromise(
          fetchJson(
            MediaListResponseSchema,
            `${API_BASE}/media?limit=${pageLimit}&offset=${offset}`,
            undefined,
            signal,
          ),
        );

        items.push(...page.items);

        if (!page.has_more || page.items.length === 0) {
          break;
        }

        offset += page.items.length;
      }

      return items;
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

export function useMediaListQuery(options?: { enabled?: boolean }) {
  return useQuery({
    ...mediaListQueryOptions(),
    ...(options?.enabled === undefined ? {} : { enabled: options.enabled }),
  });
}

export function mediaDetailsQueryOptions(id: number) {
  return queryOptions({
    queryKey: animeKeys.detail(id),
    queryFn: ({ signal }) =>
      Effect.runPromise(fetchJson(MediaSchema, `${API_BASE}/media/${id}`, undefined, signal)),
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

export function useMediaDetailsQuery(id: number) {
  return useQuery({
    ...mediaDetailsQueryOptions(id),
    enabled: !!id,
  });
}

export function unitsQueryOptions(mediaId: number) {
  return queryOptions({
    queryKey: animeKeys.units(mediaId),
    queryFn: ({ signal }) =>
      Effect.runPromise(
        fetchJson(
          Schema.Array(MediaUnitSchema),
          `${API_BASE}/media/${mediaId}/units`,
          undefined,
          signal,
        ),
      ),
    staleTime: 1000 * 60 * 5,
  });
}

export function useUnitsQuery(mediaId: number) {
  return useQuery({
    ...unitsQueryOptions(mediaId),
    enabled: !!mediaId,
  });
}

export function listFilesQueryOptions(mediaId: number) {
  return queryOptions({
    queryKey: animeKeys.files(mediaId),
    queryFn: ({ signal }) =>
      Effect.runPromise(
        fetchJson(
          Schema.Array(VideoFileSchema),
          `${API_BASE}/media/${mediaId}/files`,
          undefined,
          signal,
        ),
      ),
    staleTime: 1000 * 60,
  });
}

export function useListFilesQuery(mediaId: number, options?: { enabled?: boolean }) {
  return useQuery({
    ...listFilesQueryOptions(mediaId),
    enabled: !!mediaId && (options?.enabled ?? true),
  });
}

export function mediaSearchQueryOptions(query: string, mediaKind: MediaKind = "anime") {
  return queryOptions({
    queryKey: animeKeys.search.query(`${mediaKind}:${query}`),
    queryFn: ({ signal }) =>
      Effect.runPromise(
        fetchJson(
          MediaSearchResponseSchema,
          `${API_BASE}/media/search?q=${encodeURIComponent(query)}&media_kind=${mediaKind}`,
          undefined,
          signal,
        ),
      ),
    staleTime: 1000 * 60 * 60, // 1 hour
  });
}

export function useMediaSearchQuery(query: string, mediaKind: MediaKind = "anime") {
  const normalizedQuery = query.trim();

  return useQuery({
    ...mediaSearchQueryOptions(normalizedQuery, mediaKind),
    enabled: normalizedQuery.length >= 3,
  });
}

export function unitSearchQueryOptions(mediaId: number, unitNumber: number) {
  return queryOptions({
    queryKey: animeKeys.search.units(mediaId, unitNumber),
    queryFn: ({ signal }) =>
      Effect.runPromise(
        fetchJson(
          Schema.Array(UnitSearchResultSchema),
          `${API_BASE}/search/units/${mediaId}/${unitNumber}`,
          undefined,
          signal,
        ),
      ),
  });
}

export function useUnitSearchQuery(mediaId: number, unitNumber: number, enabled = false) {
  return useQuery({
    ...unitSearchQueryOptions(mediaId, unitNumber),
    enabled,
  });
}

export function nyaaSearchQueryOptions(
  query: string,
  options: {
    mediaId?: number;
    category?: string;
    filter?: string;
  } = {},
) {
  const queryKeyOptions = {
    ...(options.mediaId === undefined ? {} : { mediaId: options.mediaId }),
    ...(options.category === undefined ? {} : { category: options.category }),
    ...(options.filter === undefined ? {} : { filter: options.filter }),
  };

  return queryOptions({
    queryKey: animeKeys.search.releases(query, queryKeyOptions),
    queryFn: ({ signal }) => {
      const params = new URLSearchParams();
      params.append("query", query);
      if (options.mediaId) {
        params.append("media_id", options.mediaId.toString());
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

export function useNyaaSearchQuery(
  query: string,
  options: {
    mediaId?: number | undefined;
    category?: string | undefined;
    filter?: string | undefined;
    enabled?: boolean | undefined;
  } = {},
) {
  const normalizedQuery = query.trim();

  return useQuery({
    ...nyaaSearchQueryOptions(normalizedQuery, {
      ...(options.mediaId === undefined ? {} : { mediaId: options.mediaId }),
      ...(options.category === undefined ? {} : { category: options.category }),
      ...(options.filter === undefined ? {} : { filter: options.filter }),
    }),
    enabled: (options.enabled ?? true) && normalizedQuery.length > 0,
  });
}

export function mediaByAnilistIdQueryOptions(id: number, mediaKind: MediaKind = "anime") {
  return queryOptions({
    queryKey: animeKeys.anilist(id, mediaKind),
    queryFn: ({ signal }) =>
      Effect.runPromise(
        fetchJson(
          MediaSearchResultSchema,
          `${API_BASE}/media/anilist/${id}?media_kind=${mediaKind}`,
          undefined,
          signal,
        ),
      ),
    staleTime: 1000 * 60 * 60,
  });
}

export function useMediaByAnilistIdQuery(id: number | null, mediaKind: MediaKind = "anime") {
  return useQuery({
    ...mediaByAnilistIdQueryOptions(id ?? 0, mediaKind),
    enabled: id !== null && id > 0,
  });
}

export function seasonalMediaQueryOptions(input?: {
  season?: MediaSeason;
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
          SeasonalMediaResponseSchema,
          `${API_BASE}/media/seasonal?${params.toString()}`,
          undefined,
          signal,
        ),
      ),
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

export function useSeasonalMediaQuery(input?: {
  season?: MediaSeason;
  year?: number;
  limit?: number;
  page?: number;
}) {
  return useQuery({
    ...seasonalMediaQueryOptions(input),
  });
}

export function seasonalMediaInfiniteQueryOptions(input?: {
  season?: MediaSeason;
  year?: number;
  limit?: number;
}) {
  const season = input?.season;
  const year = input?.year;
  const limit = input?.limit ?? 25;

  return infiniteQueryOptions({
    queryKey: [
      "media",
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
          SeasonalMediaResponseSchema,
          `${API_BASE}/media/seasonal?${params.toString()}`,
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

export function useSeasonalMediaInfiniteQuery(input?: {
  season?: MediaSeason;
  year?: number;
  limit?: number;
  enabled?: boolean;
}) {
  return useInfiniteQuery({
    ...seasonalMediaInfiniteQueryOptions(input),
    enabled: input?.enabled ?? true,
  });
}
