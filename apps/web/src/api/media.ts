import {
  infiniteQueryOptions,
  keepPreviousData,
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type { Media, MediaKind, MediaSeason } from "./contracts";
import {
  MediaListResponseSchema,
  MediaSchema,
  MediaSearchResponseSchema,
  MediaSearchResultSchema,
  RenamePreviewItemSchema,
  RenameResultSchema,
  MediaUnitSchema,
  UnitSearchResultSchema,
  SearchResultsSchema,
  SeasonalMediaResponseSchema,
  VideoFileSchema,
} from "@bakarr/shared";
import { Schema } from "effect";
import { API_BASE } from "~/api/constants";
import { apiUrl, fetchJson, runApiEffect } from "~/api/effect/api-client";
import { animeKeys } from "./keys";

export function mediaListQueryOptions() {
  return queryOptions({
    queryKey: animeKeys.lists(),
    queryFn: async ({ signal }) => {
      const pageLimit = 500;
      const items: Media[] = [];
      let offset = 0;

      while (true) {
        const page = await runApiEffect(
          fetchJson(
            MediaListResponseSchema,
            apiUrl("/media", { limit: pageLimit, offset }),
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
    enabled: options?.enabled ?? true,
  });
}

export function mediaDetailsQueryOptions(id: number) {
  return queryOptions({
    queryKey: animeKeys.detail(id),
    queryFn: ({ signal }) =>
      runApiEffect(fetchJson(MediaSchema, `${API_BASE}/media/${id}`, undefined, signal)),
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

export function listFilesQueryOptions(mediaId: number) {
  return queryOptions({
    queryKey: animeKeys.files(mediaId),
    queryFn: ({ signal }) =>
      runApiEffect(
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

export function unitsQueryOptions(mediaId: number) {
  return queryOptions({
    queryKey: animeKeys.units(mediaId),
    queryFn: ({ signal }) =>
      runApiEffect(
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

export function mediaSearchQueryOptions(query: string, mediaKind: MediaKind = "anime") {
  return queryOptions({
    queryKey: animeKeys.search.query(query, mediaKind),
    queryFn: ({ signal }) =>
      runApiEffect(
        fetchJson(
          MediaSearchResponseSchema,
          apiUrl("/media/search", { q: query, media_kind: mediaKind }),
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
      runApiEffect(
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
    queryFn: ({ signal }) =>
      runApiEffect(
        fetchJson(
          SearchResultsSchema,
          apiUrl("/search/releases", {
            query,
            media_id: options.mediaId,
            category: options.category,
            filter: options.filter,
          }),
          undefined,
          signal,
        ),
      ),
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
      runApiEffect(
        fetchJson(
          MediaSearchResultSchema,
          apiUrl(`/media/anilist/${id}`, { media_kind: mediaKind }),
          undefined,
          signal,
        ),
      ),
    staleTime: 1000 * 60 * 60,
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
    queryKey: animeKeys.seasonalInfinite({ season, year, limit }),
    queryFn: ({ pageParam, signal }) => {
      const params = new URLSearchParams();
      if (season !== undefined) params.append("season", season);
      if (year !== undefined) params.append("year", String(year));
      params.append("limit", String(limit));
      params.append("page", String(pageParam));
      return runApiEffect(
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

export function renamePreviewQueryOptions(id: number) {
  return queryOptions({
    queryKey: animeKeys.renamePreview(id),
    queryFn: ({ signal }) =>
      runApiEffect(
        fetchJson(
          Schema.Array(RenamePreviewItemSchema),
          `${API_BASE}/media/${id}/rename-preview`,
          undefined,
          signal,
        ),
      ),
  });
}

export function useRenamePreviewQuery(id: number, options?: { enabled?: boolean }) {
  return useQuery({
    ...renamePreviewQueryOptions(id),
    enabled: options?.enabled ?? true,
  });
}

const AnimeEpisodeStreamUrlSchema = Schema.Struct({ url: Schema.String });

export function useAnimeEpisodeStreamUrlMutation() {
  return useMutation({
    mutationFn: (input: { mediaId: number; unitNumber: number }) =>
      runApiEffect(
        fetchJson(
          AnimeEpisodeStreamUrlSchema,
          apiUrl(`/media/${input.mediaId}/stream-url`, { unitNumber: input.unitNumber }),
        ),
      ),
  });
}

export function useExecuteRenameMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      runApiEffect(
        fetchJson(RenameResultSchema, `${API_BASE}/media/${id}/rename`, {
          method: "POST",
        }),
      ),
    onSuccess: (_, id) => {
      void queryClient.invalidateQueries({ queryKey: animeKeys.units(id) });
      void queryClient.invalidateQueries({ queryKey: animeKeys.detail(id) });
      void queryClient.invalidateQueries({ queryKey: animeKeys.files(id) });
      void queryClient.invalidateQueries({ queryKey: animeKeys.renamePreview(id) });
    },
  });
}
