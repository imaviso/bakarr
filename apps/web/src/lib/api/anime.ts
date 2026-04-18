import {
  infiniteQueryOptions,
  keepPreviousData,
  queryOptions,
  useInfiniteQuery,
  useQuery,
} from "@tanstack/solid-query";
import type {
  Anime,
  AnimeListResponse,
  AnimeSearchResponse,
  AnimeSearchResult,
  AnimeSeason,
  Episode,
  EpisodeSearchResult,
  SearchResults,
  SeasonalAnimeResponse,
  VideoFile,
} from "./contracts";
import { API_BASE, fetchApi } from "./client";
import { animeKeys } from "./keys";

export function animeListQueryOptions() {
  return queryOptions({
    queryKey: animeKeys.lists(),
    queryFn: async ({ signal }) => {
      const pageLimit = 500;
      const items: Anime[] = [];
      let offset = 0;

      const fetchPage = async (pageOffset: number): Promise<void> => {
        const res = await fetchApi<AnimeListResponse>(
          `${API_BASE}/anime?limit=${pageLimit}&offset=${pageOffset}`,
          undefined,
          signal,
        );

        items.push(...res.items);

        if (!res.has_more || res.items.length === 0) {
          return;
        }

        await fetchPage(pageOffset + res.items.length);
      };

      await fetchPage(offset);
      return items;
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

export function createAnimeListQuery() {
  return useQuery(animeListQueryOptions);
}

export function animeDetailsQueryOptions(id: number) {
  return queryOptions({
    queryKey: animeKeys.detail(id),
    queryFn: ({ signal }) => fetchApi<Anime>(`${API_BASE}/anime/${id}`, undefined, signal),
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

export function createAnimeDetailsQuery(id: () => number) {
  return useQuery(() => ({
    ...animeDetailsQueryOptions(id()),
    enabled: !!id(),
  }));
}

export function episodesQueryOptions(animeId: number) {
  return queryOptions({
    queryKey: animeKeys.episodes(animeId),
    queryFn: ({ signal }) =>
      fetchApi<Episode[]>(`${API_BASE}/anime/${animeId}/episodes`, undefined, signal),
    staleTime: 1000 * 60 * 5,
  });
}

export function createEpisodesQuery(animeId: () => number) {
  return useQuery(() => ({
    ...episodesQueryOptions(animeId()),
    enabled: !!animeId(),
  }));
}

export function listFilesQueryOptions(animeId: number) {
  return queryOptions({
    queryKey: animeKeys.files(animeId),
    queryFn: ({ signal }) =>
      fetchApi<VideoFile[]>(`${API_BASE}/anime/${animeId}/files`, undefined, signal),
    staleTime: 1000 * 60,
  });
}

export function createListFilesQuery(animeId: () => number) {
  return useQuery(() => ({
    ...listFilesQueryOptions(animeId()),
    enabled: !!animeId(),
  }));
}

export function animeSearchQueryOptions(query: string) {
  return queryOptions({
    queryKey: animeKeys.search.query(query),
    queryFn: ({ signal }) =>
      fetchApi<AnimeSearchResponse>(
        `${API_BASE}/anime/search?q=${encodeURIComponent(query)}`,
        undefined,
        signal,
      ),
    staleTime: 1000 * 60 * 60, // 1 hour
  });
}

export function createAnimeSearchQuery(query: () => string) {
  return useQuery(() => {
    const normalizedQuery = query().trim();

    return {
      ...animeSearchQueryOptions(normalizedQuery),
      enabled: normalizedQuery.length >= 3,
      placeholderData: (prev: AnimeSearchResponse | undefined) => prev,
    };
  });
}

export function episodeSearchQueryOptions(animeId: number, episodeNumber: number) {
  return queryOptions({
    queryKey: animeKeys.search.episode(animeId, episodeNumber),
    queryFn: ({ signal }) =>
      fetchApi<EpisodeSearchResult[]>(
        `${API_BASE}/search/episode/${animeId}/${episodeNumber}`,
        undefined,
        signal,
      ),
  });
}

export function createEpisodeSearchQuery(animeId: () => number, episodeNumber: () => number) {
  return useQuery(() => ({
    ...episodeSearchQueryOptions(animeId(), episodeNumber()),
    enabled: false,
  }));
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
      return fetchApi<SearchResults>(
        `${API_BASE}/search/releases?${params.toString()}`,
        undefined,
        signal,
      );
    },
    staleTime: 60 * 1000,
  });
}

export function createNyaaSearchQuery(
  query: () => string,
  options: {
    animeId?: () => number | undefined;
    category?: () => string | undefined;
    filter?: () => string | undefined;
    enabled?: () => boolean | undefined;
  } = {},
) {
  return useQuery(() => {
    const normalizedQuery = query().trim();

    return {
      ...(() => {
        const animeId = options.animeId?.();
        const category = options.category?.();
        const filter = options.filter?.();
        return nyaaSearchQueryOptions(normalizedQuery, {
          ...(animeId === undefined ? {} : { animeId }),
          ...(category === undefined ? {} : { category }),
          ...(filter === undefined ? {} : { filter }),
        });
      })(),
      enabled: (options.enabled?.() ?? true) && normalizedQuery.length > 0,
    };
  });
}

export function animeByAnilistIdQueryOptions(id: number) {
  return queryOptions({
    queryKey: animeKeys.anilist(id),
    queryFn: ({ signal }) =>
      fetchApi<AnimeSearchResult>(`${API_BASE}/anime/anilist/${id}`, undefined, signal),
    staleTime: 1000 * 60 * 60,
  });
}

export function createAnimeByAnilistIdQuery(id: () => number | null) {
  return useQuery(() => {
    const currentId = id();
    if (!currentId) {
      return {
        queryKey: animeKeys.anilist(0),
        queryFn: async () => {
          throw new Error("Query disabled");
        },
        enabled: false,
      };
    }
    return {
      ...animeByAnilistIdQueryOptions(currentId),
      enabled: true,
    };
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
      fetchApi<SeasonalAnimeResponse>(
        `${API_BASE}/anime/seasonal?${params.toString()}`,
        undefined,
        signal,
      ),
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

export function createSeasonalAnimeQuery(
  input?: () => { season?: AnimeSeason; year?: number; limit?: number; page?: number },
) {
  return useQuery(() => {
    const resolved = input?.();
    return {
      ...seasonalAnimeQueryOptions(resolved),
    };
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
    queryKey: [...animeKeys.seasonal({ season, year, limit }).slice(0, 4), "infinite"] as const,
    queryFn: ({ pageParam, signal }) => {
      const params = new URLSearchParams();
      if (season !== undefined) params.append("season", season);
      if (year !== undefined) params.append("year", String(year));
      params.append("limit", String(limit));
      params.append("page", String(pageParam));
      return fetchApi<SeasonalAnimeResponse>(
        `${API_BASE}/anime/seasonal?${params.toString()}`,
        undefined,
        signal,
      );
    },
    getNextPageParam: (lastPage) => (lastPage.has_more ? lastPage.page + 1 : undefined),
    initialPageParam: 1,
    placeholderData: keepPreviousData,
    staleTime: 1000 * 60 * 5,
  });
}

export function createSeasonalAnimeInfiniteQuery(
  input?: () => { season?: AnimeSeason; year?: number; limit?: number },
) {
  return useInfiniteQuery(() => seasonalAnimeInfiniteQueryOptions(input?.()));
}
