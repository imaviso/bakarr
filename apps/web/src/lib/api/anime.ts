import {
  infiniteQueryOptions,
  queryOptions,
  useInfiniteQuery,
  useQuery,
} from "@tanstack/solid-query";
import type {
  Anime,
  AnimeListResponse,
  AnimeSearchResponse,
  AnimeSearchResult,
  Episode,
  EpisodeSearchResult,
  SearchResults,
  SystemLogsResponse,
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

// ... rest of file (I'll add the infinite query at the bottom)

export function infiniteLogsQueryOptions(
  level?: string,
  eventType?: string,
  startDate?: string,
  endDate?: string,
) {
  return infiniteQueryOptions({
    queryKey: [
      ...animeKeys.system.logs(1, level, eventType, startDate, endDate).slice(0, 2),
      "infinite",
      { level, eventType, startDate, endDate },
    ] as const,
    queryFn: ({ pageParam = 1, signal }) => {
      const params = new URLSearchParams({ page: pageParam.toString() });
      if (level) params.append("level", level);
      if (eventType) params.append("event_type", eventType);
      if (startDate) params.append("start_date", startDate);
      if (endDate) params.append("end_date", endDate);
      return fetchApi<SystemLogsResponse>(
        `${API_BASE}/system/logs?${params.toString()}`,
        undefined,
        signal,
      );
    },
    getNextPageParam: (lastPage, allPages) => {
      if (allPages.length >= lastPage.total_pages) return undefined;
      return allPages.length + 1;
    },
    initialPageParam: 1,
    staleTime: 1000 * 10,
  });
}

export function createInfiniteLogsQuery(
  level: () => string | undefined,
  eventType: () => string | undefined,
  startDate: () => string | undefined,
  endDate: () => string | undefined,
) {
  return useInfiniteQuery(() =>
    infiniteLogsQueryOptions(level(), eventType(), startDate(), endDate()),
  );
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
  return useQuery(() => ({
    ...animeSearchQueryOptions(query()),
    enabled: query().length >= 3,
    placeholderData: (prev: AnimeSearchResponse | undefined) => prev,
  }));
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
    anime_id?: number;
    category?: string;
    filter?: string;
  } = {},
) {
  const queryKeyOptions = {
    ...(options.anime_id === undefined ? {} : { animeId: options.anime_id }),
    ...(options.category === undefined ? {} : { category: options.category }),
    ...(options.filter === undefined ? {} : { filter: options.filter }),
  };

  return queryOptions({
    queryKey: animeKeys.search.releases(query, queryKeyOptions),
    queryFn: ({ signal }) => {
      const params = new URLSearchParams();
      params.append("query", query);
      if (options.anime_id) {
        params.append("anime_id", options.anime_id.toString());
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
    anime_id?: () => number | undefined;
    category?: () => string | undefined;
    filter?: () => string | undefined;
    enabled?: () => boolean | undefined;
  } = {},
) {
  return useQuery(() => ({
    ...(() => {
      const animeId = options.anime_id?.();
      const category = options.category?.();
      const filter = options.filter?.();
      return nyaaSearchQueryOptions(query(), {
        ...(animeId === undefined ? {} : { anime_id: animeId }),
        ...(category === undefined ? {} : { category }),
        ...(filter === undefined ? {} : { filter }),
      });
    })(),
    enabled: (options.enabled?.() ?? true) && !!query(),
  }));
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
