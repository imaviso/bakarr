import {
  infiniteQueryOptions,
  keepPreviousData,
  queryOptions,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/solid-query";
// ... (rest of imports)
import type {
  ActivityItem,
  Anime,
  AnimeSearchResult,
  ApiKeyLoginRequest,
  ApiKeyResponse,
  AuthUser,
  BackgroundJobStatus,
  BrowseEntry,
  BrowseResult,
  CalendarEvent,
  ChangePasswordRequest,
  Config,
  Download,
  DownloadAction,
  DownloadEvent,
  DownloadStatus,
  Episode,
  EpisodeProgress,
  EpisodeSearchResult,
  FailedImport,
  ImportResult,
  ImportedFile,
  LibraryStats,
  LoginRequest,
  LoginResponse,
  MissingEpisode,
  NyaaSearchResult,
  OpsDashboard,
  Quality,
  QualityProfile,
  ReleaseProfile,
  ReleaseProfileRule,
  RenamePreviewItem,
  RenameResult,
  RssFeed,
  ScanResult,
  ScannedFile,
  ScannerState,
  SearchResults,
  SkippedFile,
  SystemLog,
  SystemLogsResponse,
  SystemStatus,
  UnmappedFolder,
  VideoFile,
} from "@bakarr/shared";
import { getAuthHeaders, logout } from "~/lib/auth";

// ==================== API Client ====================

const API_BASE = "/api";

type ApiRequestOptions = RequestInit & {
  skipAutoLogoutOnUnauthorized?: boolean;
};

async function fetchApi<T>(
  endpoint: string,
  options?: ApiRequestOptions,
  signal?: AbortSignal,
): Promise<T> {
  const res = await fetch(endpoint, {
    ...options,
    signal,
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders(),
      ...options?.headers,
    },
  });

  if (res.status === 401 && !options?.skipAutoLogoutOnUnauthorized) {
    logout();
    throw new Error("Session expired");
  }

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(errorText || `API error: ${res.status}`);
  }

  const json = await res.json();
  if (json && typeof json === "object" && "data" in json && "success" in json) {
    if (!json.success) {
      throw new Error(json.error || "Unknown API error");
    }
    return json.data as T;
  }

  return json as T;
}

// ==================== Types ====================
export type {
  ActivityItem,
  Anime,
  AnimeSearchResult,
  ApiKeyLoginRequest,
  ApiKeyResponse,
  AuthUser,
  BackgroundJobStatus,
  BrowseEntry,
  BrowseResult,
  CalendarEvent,
  ChangePasswordRequest,
  Config,
  Download,
  DownloadAction,
  DownloadEvent,
  DownloadStatus,
  Episode,
  EpisodeProgress,
  EpisodeSearchResult,
  FailedImport,
  ImportResult,
  ImportedFile,
  LibraryStats,
  LoginRequest,
  LoginResponse,
  MissingEpisode,
  NyaaSearchResult,
  OpsDashboard,
  Quality,
  QualityProfile,
  ReleaseProfile,
  ReleaseProfileRule,
  RenamePreviewItem,
  RenameResult,
  RssFeed,
  ScanResult,
  ScannedFile,
  ScannerState,
  SearchResults,
  SkippedFile,
  SystemLog,
  SystemLogsResponse,
  SystemStatus,
  UnmappedFolder,
  VideoFile,
};

export interface ScanFolderResult {
  found: number;
  total: number;
}
export type ImportFileRequest = Pick<
  ImportedFile,
  "anime_id" | "episode_number" | "source_path"
> & {
  season?: number;
};

export type ReleaseProfileCreateRequest = Pick<
  ReleaseProfile,
  "is_global" | "name" | "rules"
>;

export type ReleaseProfileUpdateRequest = Pick<
  ReleaseProfile,
  "enabled" | "is_global" | "name" | "rules"
>;

export type RssFeedCreateRequest = Pick<RssFeed, "anime_id" | "name" | "url">;

export interface UnmappedFolderImportRequest {
  folder_name: string;
  anime_id: number;
  profile_name?: string;
}

// ==================== Query Key Factory ====================

export const animeKeys = {
  all: ["anime"] as const,
  lists: () => ["anime", "list"] as const,
  detail: (id: number) => ["anime", "detail", id] as const,
  episodes: (id: number) => ["anime", "detail", id, "episodes"] as const,
  files: (id: number) => ["anime", "detail", id, "files"] as const,
  search: {
    all: ["search"] as const,
    query: (q: string) => ["anime", "search", q] as const,
    episode: (animeId: number, episodeNumber: number) =>
      ["search", "episode", animeId, episodeNumber] as const,
    releases: (
      query: string,
      options?: { animeId?: number; category?: string; filter?: string },
    ) => ["search", "releases", { query, ...options }] as const,
  },
  anilist: (id: number) => ["anime", "anilist", id] as const,
  library: {
    all: ["library"] as const,
    stats: () => ["library", "stats"] as const,
    activity: () => ["library", "activity"] as const,
    unmapped: () => ["library", "unmapped"] as const,
  },
  downloads: {
    all: ["downloads"] as const,
    queue: () => ["downloads", "queue"] as const,
    history: () => ["downloads", "history"] as const,
  },
  profiles: {
    all: ["profiles"] as const,
    qualities: () => ["profiles", "qualities"] as const,
  },
  releaseProfiles: ["release-profiles"] as const,
  renamePreview: (id: number) => ["rename-preview", id] as const,
  rss: {
    all: ["rss"] as const,
    anime: (id: number) => ["rss", "anime", id] as const,
  },
  calendar: (start: string, end: string) => ["calendar", start, end] as const,
  wanted: (limit: number) => ["wanted", limit] as const,
  browse: (path: string) => ["browse", path] as const,
  auth: {
    all: ["auth"] as const,
    me: () => ["auth", "me"] as const,
    apiKey: () => ["auth", "api-key"] as const,
  },
  system: {
    all: ["system"] as const,
    config: () => ["system", "config"] as const,
    dashboard: () => ["system", "dashboard"] as const,
    jobs: () => ["system", "jobs"] as const,
    status: () => ["system", "status"] as const,
    logs: (
      page: number,
      level?: string,
      eventType?: string,
      startDate?: string,
      endDate?: string,
    ) =>
      [
        "system",
        "logs",
        { page, level, eventType, startDate, endDate },
      ] as const,
  },
} as const satisfies Record<string, unknown>;

// ==================== Library Hooks ====================

export function libraryStatsQueryOptions() {
  return queryOptions({
    queryKey: animeKeys.library.stats(),
    queryFn: ({ signal }) =>
      fetchApi<LibraryStats>(`${API_BASE}/library/stats`, undefined, signal),
    staleTime: 1000 * 60, // 1 minute
  });
}

export function createLibraryStatsQuery() {
  return useQuery(libraryStatsQueryOptions);
}

export function activityQueryOptions() {
  return queryOptions({
    queryKey: animeKeys.library.activity(),
    queryFn: ({ signal }) =>
      fetchApi<ActivityItem[]>(
        `${API_BASE}/library/activity`,
        undefined,
        signal,
      ),
    staleTime: 1000 * 30, // 30 seconds
  });
}

export function createActivityQuery() {
  return useQuery(activityQueryOptions);
}

// ==================== Anime Hooks ====================

export function animeListQueryOptions() {
  return queryOptions({
    queryKey: animeKeys.lists(),
    queryFn: ({ signal }) =>
      fetchApi<Anime[]>(`${API_BASE}/anime`, undefined, signal),
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

export function createAnimeListQuery() {
  return useQuery(animeListQueryOptions);
}

export function animeDetailsQueryOptions(id: number) {
  return queryOptions({
    queryKey: animeKeys.detail(id),
    queryFn: ({ signal }) =>
      fetchApi<Anime>(`${API_BASE}/anime/${id}`, undefined, signal),
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
      ...animeKeys.system
        .logs(1, level, eventType, startDate, endDate)
        .slice(0, 2),
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
    infiniteLogsQueryOptions(level(), eventType(), startDate(), endDate())
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
      fetchApi<Episode[]>(
        `${API_BASE}/anime/${animeId}/episodes`,
        undefined,
        signal,
      ),
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
      fetchApi<VideoFile[]>(
        `${API_BASE}/anime/${animeId}/files`,
        undefined,
        signal,
      ),
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
      fetchApi<AnimeSearchResult[]>(
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
  }));
}

export function episodeSearchQueryOptions(
  animeId: number,
  episodeNumber: number,
) {
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

export function createEpisodeSearchQuery(
  animeId: () => number,
  episodeNumber: () => number,
) {
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
  return queryOptions({
    queryKey: animeKeys.search.releases(query, {
      animeId: options.anime_id,
      category: options.category,
      filter: options.filter,
    }),
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
    anime_id?: () => number;
    category?: () => string | undefined;
    filter?: () => string | undefined;
    enabled?: () => boolean;
  } = {},
) {
  return useQuery(() => ({
    ...nyaaSearchQueryOptions(query(), {
      anime_id: options.anime_id?.(),
      category: options.category?.(),
      filter: options.filter?.(),
    }),
    enabled: (options.enabled?.() ?? true) && !!query(),
  }));
}

export function animeByAnilistIdQueryOptions(id: number) {
  return queryOptions({
    queryKey: animeKeys.anilist(id),
    queryFn: ({ signal }) =>
      fetchApi<AnimeSearchResult>(
        `${API_BASE}/anime/anilist/${id}`,
        undefined,
        signal,
      ),
    staleTime: 1000 * 60 * 60,
  });
}

export function createAnimeByAnilistIdQuery(id: () => number | null) {
  return useQuery(() => {
    const currentId = id();
    if (!currentId) {
      return {
        queryKey: animeKeys.anilist(0),
        queryFn: () => Promise.resolve({} as AnimeSearchResult),
        enabled: false,
      };
    }
    return {
      ...animeByAnilistIdQueryOptions(currentId),
      enabled: true,
    };
  });
}

// ==================== Mutation Hooks ====================

export function createAddAnimeMutation() {
  const queryClient = useQueryClient();
  return useMutation(() => ({
    mutationFn: (data: {
      id: number;
      profile_name: string;
      root_folder: string;
      monitor_and_search: boolean;
      monitored: boolean;
      release_profile_ids: number[];
    }) =>
      fetchApi<Anime>(`${API_BASE}/anime`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: (newAnime) => {
      queryClient.setQueryData<Anime[]>(animeKeys.lists(), (old) => {
        if (!old) return [newAnime];
        return [...old, newAnime].sort((a, b) =>
          a.title.romaji.localeCompare(b.title.romaji)
        );
      });
      queryClient.invalidateQueries({ queryKey: animeKeys.system.status() });
    },
  }));
}

export function createDeleteAnimeMutation() {
  const queryClient = useQueryClient();
  return useMutation(() => ({
    mutationFn: (id: number) =>
      fetchApi(`${API_BASE}/anime/${id}`, { method: "DELETE" }),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: animeKeys.lists() });
      queryClient.invalidateQueries({ queryKey: animeKeys.system.status() });
    },
  }));
}

export function createToggleMonitorMutation() {
  const queryClient = useQueryClient();
  return useMutation(() => ({
    mutationFn: ({ id, monitored }: { id: number; monitored: boolean }) =>
      fetchApi(`${API_BASE}/anime/${id}/monitor`, {
        method: "POST",
        body: JSON.stringify({ monitored }),
      }),
    onMutate: async ({ id, monitored }) => {
      await queryClient.cancelQueries({ queryKey: animeKeys.detail(id) });
      await queryClient.cancelQueries({ queryKey: animeKeys.lists() });

      const previousAnime = queryClient.getQueryData<Anime>(
        animeKeys.detail(id),
      );
      const previousList = queryClient.getQueryData<Anime[]>(animeKeys.lists());

      if (previousAnime) {
        queryClient.setQueryData<Anime>(animeKeys.detail(id), {
          ...previousAnime,
          monitored,
        });
      }

      if (previousList) {
        queryClient.setQueryData<Anime[]>(
          animeKeys.lists(),
          previousList.map((a) => (a.id === id ? { ...a, monitored } : a)),
        );
      }

      return { previousAnime, previousList };
    },
    onError: (_err, { id }, context) => {
      if (context?.previousAnime) {
        queryClient.setQueryData(animeKeys.detail(id), context.previousAnime);
      }
      if (context?.previousList) {
        queryClient.setQueryData(animeKeys.lists(), context.previousList);
      }
    },
    onSettled: (_, __, { id }) => {
      queryClient.invalidateQueries({ queryKey: animeKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: animeKeys.lists() });
    },
  }));
}

export function createUpdateAnimePathMutation() {
  const queryClient = useQueryClient();
  return useMutation(() => ({
    mutationFn: (
      { id, path }: { id: number; path: string; rescan?: boolean },
    ) =>
      fetchApi(`${API_BASE}/anime/${id}/path`, {
        method: "PUT",
        body: JSON.stringify({ path }),
      }),
    onMutate: async ({ id, path }) => {
      await queryClient.cancelQueries({ queryKey: animeKeys.detail(id) });
      const previousAnime = queryClient.getQueryData<Anime>(
        animeKeys.detail(id),
      );
      if (previousAnime) {
        queryClient.setQueryData<Anime>(animeKeys.detail(id), {
          ...previousAnime,
          root_folder: path,
        });
      }
      return { previousAnime };
    },
    onError: (_err, { id }, context) => {
      if (context?.previousAnime) {
        queryClient.setQueryData(animeKeys.detail(id), context.previousAnime);
      }
    },
    onSettled: (_, __, { id }) => {
      queryClient.invalidateQueries({ queryKey: animeKeys.detail(id) });
    },
  }));
}

export function createUpdateAnimeProfileMutation() {
  const queryClient = useQueryClient();
  return useMutation(() => ({
    mutationFn: ({ id, profileName }: { id: number; profileName: string }) =>
      fetchApi(`${API_BASE}/anime/${id}/profile`, {
        method: "PUT",
        body: JSON.stringify({ profile_name: profileName }),
      }),
    onMutate: async ({ id, profileName }) => {
      await queryClient.cancelQueries({ queryKey: animeKeys.detail(id) });
      const previousAnime = queryClient.getQueryData<Anime>(
        animeKeys.detail(id),
      );
      if (previousAnime) {
        queryClient.setQueryData<Anime>(animeKeys.detail(id), {
          ...previousAnime,
          profile_name: profileName,
        });
      }
      return { previousAnime };
    },
    onError: (_err, { id }, context) => {
      if (context?.previousAnime) {
        queryClient.setQueryData(animeKeys.detail(id), context.previousAnime);
      }
    },
    onSettled: (_, __, { id }) => {
      queryClient.invalidateQueries({ queryKey: animeKeys.detail(id) });
    },
  }));
}

export function createUpdateAnimeReleaseProfilesMutation() {
  const queryClient = useQueryClient();
  return useMutation(() => ({
    mutationFn: ({
      id,
      releaseProfileIds,
    }: {
      id: number;
      releaseProfileIds: number[];
    }) =>
      fetchApi(`${API_BASE}/anime/${id}/release-profiles`, {
        method: "PUT",
        body: JSON.stringify({ release_profile_ids: releaseProfileIds }),
      }),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: animeKeys.detail(id) });
    },
  }));
}

export function createRefreshEpisodesMutation() {
  const queryClient = useQueryClient();
  return useMutation(() => ({
    mutationFn: (animeId: number) =>
      fetchApi(`${API_BASE}/anime/${animeId}/episodes/refresh`, {
        method: "POST",
      }),
    onSuccess: (_, animeId) => {
      queryClient.invalidateQueries({ queryKey: animeKeys.detail(animeId) });
      queryClient.invalidateQueries({ queryKey: animeKeys.episodes(animeId) });
      queryClient.invalidateQueries({ queryKey: animeKeys.lists() });
    },
  }));
}

export function createScanFolderMutation() {
  const queryClient = useQueryClient();
  return useMutation(() => ({
    mutationFn: (animeId: number) =>
      fetchApi<ScanFolderResult>(`${API_BASE}/anime/${animeId}/episodes/scan`, {
        method: "POST",
      }),
    onSuccess: (_, animeId) => {
      queryClient.invalidateQueries({ queryKey: animeKeys.episodes(animeId) });
      queryClient.invalidateQueries({ queryKey: animeKeys.detail(animeId) });
      queryClient.invalidateQueries({ queryKey: animeKeys.lists() });
    },
  }));
}

export function createDeleteEpisodeFileMutation() {
  const queryClient = useQueryClient();
  return useMutation(() => ({
    mutationFn: ({
      animeId,
      episodeNumber,
    }: {
      animeId: number;
      episodeNumber: number;
    }) =>
      fetchApi(`${API_BASE}/anime/${animeId}/episodes/${episodeNumber}/file`, {
        method: "DELETE",
      }),
    onSuccess: (_, { animeId }) => {
      queryClient.invalidateQueries({ queryKey: animeKeys.episodes(animeId) });
    },
  }));
}

export function createMapEpisodeMutation() {
  const queryClient = useQueryClient();
  return useMutation(() => ({
    mutationFn: ({
      animeId,
      episodeNumber,
      filePath,
    }: {
      animeId: number;
      episodeNumber: number;
      filePath: string;
    }) =>
      fetchApi(`${API_BASE}/anime/${animeId}/episodes/${episodeNumber}/map`, {
        method: "POST",
        body: JSON.stringify({ file_path: filePath }),
      }),
    onSuccess: (_, { animeId }) => {
      queryClient.invalidateQueries({ queryKey: animeKeys.episodes(animeId) });
      queryClient.invalidateQueries({ queryKey: animeKeys.files(animeId) });
    },
  }));
}

export function createBulkMapEpisodesMutation() {
  const queryClient = useQueryClient();
  return useMutation(() => ({
    mutationFn: ({
      animeId,
      mappings,
    }: {
      animeId: number;
      mappings: { episode_number: number; file_path: string }[];
    }) =>
      fetchApi(`${API_BASE}/anime/${animeId}/episodes/map/bulk`, {
        method: "POST",
        body: JSON.stringify({ mappings }),
      }),
    onSuccess: (_, { animeId }) => {
      queryClient.invalidateQueries({ queryKey: animeKeys.episodes(animeId) });
      queryClient.invalidateQueries({ queryKey: animeKeys.files(animeId) });
    },
  }));
}

export function createGrabReleaseMutation() {
  const queryClient = useQueryClient();
  return useMutation(() => ({
    mutationFn: (data: {
      anime_id: number;
      magnet: string;
      episode_number: number;
      title: string;
      group?: string;
      info_hash?: string;
      is_batch?: boolean;
    }) =>
      fetchApi<void>(`${API_BASE}/search/download`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: animeKeys.downloads.queue() });
      queryClient.invalidateQueries({
        queryKey: animeKeys.downloads.history(),
      });
      queryClient.invalidateQueries({ queryKey: animeKeys.library.activity() });
    },
  }));
}

// ==================== Profile & Release Hooks ====================

export function profilesQueryOptions() {
  return queryOptions({
    queryKey: animeKeys.profiles.all,
    queryFn: ({ signal }) =>
      fetchApi<QualityProfile[]>(`${API_BASE}/profiles`, undefined, signal),
    staleTime: Infinity,
  });
}

export function createProfilesQuery(enabled: () => boolean = () => true) {
  return useQuery(() => ({ ...profilesQueryOptions(), enabled: enabled() }));
}

export function qualitiesQueryOptions() {
  return queryOptions({
    queryKey: animeKeys.profiles.qualities(),
    queryFn: ({ signal }) =>
      fetchApi<Quality[]>(`${API_BASE}/profiles/qualities`, undefined, signal),
    staleTime: Infinity,
  });
}

export function createQualitiesQuery() {
  return useQuery(qualitiesQueryOptions);
}

export function releaseProfilesQueryOptions() {
  return queryOptions({
    queryKey: animeKeys.releaseProfiles,
    queryFn: ({ signal }) =>
      fetchApi<ReleaseProfile[]>(
        `${API_BASE}/release-profiles`,
        undefined,
        signal,
      ),
    staleTime: 1000 * 60 * 60,
  });
}

export function createReleaseProfilesQuery(
  enabled: () => boolean = () => true,
) {
  return useQuery(() => ({
    ...releaseProfilesQueryOptions(),
    enabled: enabled(),
  }));
}

export function createCreateProfileMutation() {
  const queryClient = useQueryClient();
  return useMutation(() => ({
    mutationFn: (data: QualityProfile) =>
      fetchApi<QualityProfile>(`${API_BASE}/profiles`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: animeKeys.profiles.all });
    },
  }));
}

export function createUpdateProfileMutation() {
  const queryClient = useQueryClient();
  return useMutation(() => ({
    mutationFn: ({
      name,
      profile,
    }: {
      name: string;
      profile: QualityProfile;
    }) =>
      fetchApi<QualityProfile>(`${API_BASE}/profiles/${name}`, {
        method: "PUT",
        body: JSON.stringify(profile),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: animeKeys.profiles.all });
    },
  }));
}

export function createDeleteProfileMutation() {
  const queryClient = useQueryClient();
  return useMutation(() => ({
    mutationFn: (name: string) =>
      fetchApi(`${API_BASE}/profiles/${name}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: animeKeys.profiles.all });
    },
  }));
}

export function createCreateReleaseProfileMutation() {
  const queryClient = useQueryClient();
  return useMutation(() => ({
    mutationFn: (data: ReleaseProfileCreateRequest) =>
      fetchApi<ReleaseProfile>(`${API_BASE}/release-profiles`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: animeKeys.releaseProfiles });
    },
  }));
}

export function createUpdateReleaseProfileMutation() {
  const queryClient = useQueryClient();
  return useMutation(() => ({
    mutationFn: ({
      id,
      data,
    }: {
      id: number;
      data: ReleaseProfileUpdateRequest;
    }) =>
      fetchApi(`${API_BASE}/release-profiles/${id}`, {
        method: "PUT",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: animeKeys.releaseProfiles });
    },
  }));
}

export function createDeleteReleaseProfileMutation() {
  const queryClient = useQueryClient();
  return useMutation(() => ({
    mutationFn: (id: number) =>
      fetchApi(`${API_BASE}/release-profiles/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: animeKeys.releaseProfiles });
    },
  }));
}

// ==================== System & Tasks Hooks ====================

export function systemConfigQueryOptions() {
  return queryOptions({
    queryKey: animeKeys.system.config(),
    queryFn: ({ signal }) =>
      fetchApi<Config>(`${API_BASE}/system/config`, undefined, signal),
    staleTime: Infinity,
    placeholderData: keepPreviousData,
  });
}

export function createSystemConfigQuery(enabled: () => boolean = () => true) {
  return useQuery(() => ({
    ...systemConfigQueryOptions(),
    enabled: enabled(),
  }));
}

export function createUpdateSystemConfigMutation() {
  const queryClient = useQueryClient();
  return useMutation(() => ({
    mutationFn: (data: Config) =>
      fetchApi(`${API_BASE}/system/config`, {
        method: "PUT",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: animeKeys.system.config() });
    },
  }));
}

export function systemStatusQueryOptions() {
  return queryOptions({
    queryKey: animeKeys.system.status(),
    queryFn: ({ signal }) =>
      fetchApi<SystemStatus>(`${API_BASE}/system/status`, undefined, signal),
    refetchInterval: 30000,
  });
}

export function createSystemStatusQuery() {
  return useQuery(systemStatusQueryOptions);
}

export function createTriggerScanMutation() {
  return useMutation(() => ({
    mutationFn: () =>
      fetchApi(`${API_BASE}/system/tasks/scan`, { method: "POST" }),
  }));
}

export function createTriggerRssCheckMutation() {
  return useMutation(() => ({
    mutationFn: () =>
      fetchApi(`${API_BASE}/system/tasks/rss`, { method: "POST" }),
  }));
}

// ==================== RSS & Others ====================

export function rssFeedsQueryOptions() {
  return queryOptions({
    queryKey: animeKeys.rss.all,
    queryFn: ({ signal }) =>
      fetchApi<RssFeed[]>(`${API_BASE}/rss`, undefined, signal),
    staleTime: 1000 * 60 * 5,
  });
}

export function createRssFeedsQuery() {
  return useQuery(rssFeedsQueryOptions);
}

export function animeRssFeedsQueryOptions(animeId: number) {
  return queryOptions({
    queryKey: animeKeys.rss.anime(animeId),
    queryFn: ({ signal }) =>
      fetchApi<RssFeed[]>(
        `${API_BASE}/anime/${animeId}/rss`,
        undefined,
        signal,
      ),
    staleTime: 1000 * 60 * 5,
  });
}

export function createAnimeRssFeedsQuery(animeId: () => number) {
  return useQuery(() => ({
    ...animeRssFeedsQueryOptions(animeId()),
    enabled: !!animeId(),
  }));
}

export function createAddRssFeedMutation() {
  const queryClient = useQueryClient();
  return useMutation(() => ({
    mutationFn: (data: RssFeedCreateRequest) =>
      fetchApi<RssFeed>(`${API_BASE}/rss`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: animeKeys.rss.all });
    },
  }));
}

export function createDeleteRssFeedMutation() {
  const queryClient = useQueryClient();
  return useMutation(() => ({
    mutationFn: (id: number) =>
      fetchApi(`${API_BASE}/rss/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: animeKeys.rss.all });
    },
  }));
}

export function createToggleRssFeedMutation() {
  const queryClient = useQueryClient();
  return useMutation(() => ({
    mutationFn: ({ id, enabled }: { id: number; enabled: boolean }) =>
      fetchApi(`${API_BASE}/rss/${id}/toggle`, {
        method: "PUT",
        body: JSON.stringify({ enabled }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: animeKeys.rss.all });
    },
  }));
}

export function calendarQueryOptions(start: Date, end: Date) {
  return queryOptions({
    queryKey: animeKeys.calendar(start.toISOString(), end.toISOString()),
    queryFn: ({ signal }) =>
      fetchApi<CalendarEvent[]>(
        `${API_BASE}/calendar?start=${start.toISOString()}&end=${end.toISOString()}`,
        undefined,
        signal,
      ),
    staleTime: 1000 * 60 * 10,
  });
}

export function createCalendarQuery(start: () => Date, end: () => Date) {
  return useQuery(() => ({
    ...calendarQueryOptions(start(), end()),
    suspense: true,
  }));
}

export function downloadQueueQueryOptions() {
  return queryOptions({
    queryKey: animeKeys.downloads.queue(),
    queryFn: ({ signal }) =>
      fetchApi<Download[]>(`${API_BASE}/downloads/queue`, undefined, signal),
    refetchInterval: 5000,
  });
}

export function createDownloadQueueQuery() {
  return useQuery(downloadQueueQueryOptions);
}

export function downloadHistoryQueryOptions() {
  return queryOptions({
    queryKey: animeKeys.downloads.history(),
    queryFn: ({ signal }) =>
      fetchApi<Download[]>(`${API_BASE}/downloads/history`, undefined, signal),
    staleTime: 1000 * 60,
  });
}

export function createDownloadHistoryQuery() {
  return useQuery(downloadHistoryQueryOptions);
}

export function createSearchMissingMutation() {
  const queryClient = useQueryClient();
  return useMutation(() => ({
    mutationFn: (animeId?: number) =>
      fetchApi(`${API_BASE}/downloads/search-missing`, {
        method: "POST",
        body: JSON.stringify({ anime_id: animeId }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: animeKeys.downloads.all });
    },
  }));
}

function invalidateDownloadQueries(
  queryClient: ReturnType<typeof useQueryClient>,
) {
  queryClient.invalidateQueries({ queryKey: animeKeys.downloads.all });
  queryClient.invalidateQueries({ queryKey: animeKeys.system.all });
}

export function createPauseDownloadMutation() {
  const queryClient = useQueryClient();
  return useMutation(() => ({
    mutationFn: (downloadId: number) =>
      fetchApi(`${API_BASE}/downloads/${downloadId}/pause`, { method: "POST" }),
    onSuccess: () => {
      invalidateDownloadQueries(queryClient);
    },
  }));
}

export function createResumeDownloadMutation() {
  const queryClient = useQueryClient();
  return useMutation(() => ({
    mutationFn: (downloadId: number) =>
      fetchApi(`${API_BASE}/downloads/${downloadId}/resume`, {
        method: "POST",
      }),
    onSuccess: () => {
      invalidateDownloadQueries(queryClient);
    },
  }));
}

export function createRetryDownloadMutation() {
  const queryClient = useQueryClient();
  return useMutation(() => ({
    mutationFn: (downloadId: number) =>
      fetchApi(`${API_BASE}/downloads/${downloadId}/retry`, { method: "POST" }),
    onSuccess: () => {
      invalidateDownloadQueries(queryClient);
    },
  }));
}

export function createDeleteDownloadMutation() {
  const queryClient = useQueryClient();
  return useMutation(() => ({
    mutationFn: (input: { downloadId: number; deleteFiles?: boolean }) =>
      fetchApi(
        `${API_BASE}/downloads/${input.downloadId}?delete_files=${
          input.deleteFiles ? "true" : "false"
        }`,
        { method: "DELETE" },
      ),
    onSuccess: () => {
      invalidateDownloadQueries(queryClient);
    },
  }));
}

export function createSyncDownloadsMutation() {
  const queryClient = useQueryClient();
  return useMutation(() => ({
    mutationFn: () =>
      fetchApi(`${API_BASE}/downloads/sync`, { method: "POST" }),
    onSuccess: () => {
      invalidateDownloadQueries(queryClient);
    },
  }));
}

export function createReconcileDownloadMutation() {
  const queryClient = useQueryClient();
  return useMutation(() => ({
    mutationFn: (downloadId: number) =>
      fetchApi(`${API_BASE}/downloads/${downloadId}/reconcile`, {
        method: "POST",
      }),
    onSuccess: () => {
      invalidateDownloadQueries(queryClient);
    },
  }));
}

export function wantedQueryOptions(limit = 100) {
  return queryOptions({
    queryKey: animeKeys.wanted(limit),
    queryFn: ({ signal }) =>
      fetchApi<MissingEpisode[]>(
        `${API_BASE}/wanted/missing?limit=${limit}`,
        undefined,
        signal,
      ),
    staleTime: 1000 * 60 * 5,
  });
}

export function createWantedQuery(limit: () => number) {
  return useQuery(() => wantedQueryOptions(limit()));
}

export function unmappedFoldersQueryOptions() {
  return queryOptions({
    queryKey: animeKeys.library.unmapped(),
    queryFn: ({ signal }) =>
      fetchApi<ScannerState>(`${API_BASE}/library/unmapped`, undefined, signal),
    refetchInterval: (query) => (query.state.data?.is_scanning ? 1000 : false),
  });
}

export function createUnmappedFoldersQuery() {
  return useQuery(unmappedFoldersQueryOptions);
}

export function createScanLibraryMutation() {
  const queryClient = useQueryClient();
  return useMutation(() => ({
    mutationFn: () =>
      fetchApi(`${API_BASE}/library/unmapped/scan`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: animeKeys.library.unmapped() });
    },
  }));
}

export function systemJobsQueryOptions() {
  return queryOptions({
    queryKey: animeKeys.system.jobs(),
    queryFn: ({ signal }) =>
      fetchApi<BackgroundJobStatus[]>(
        `${API_BASE}/system/jobs`,
        undefined,
        signal,
      ),
    staleTime: 1000 * 10,
  });
}

export function createSystemJobsQuery() {
  return useQuery(systemJobsQueryOptions);
}

export function systemDashboardQueryOptions() {
  return queryOptions({
    queryKey: animeKeys.system.dashboard(),
    queryFn: ({ signal }) =>
      fetchApi<OpsDashboard>(`${API_BASE}/system/dashboard`, undefined, signal),
    staleTime: 1000 * 10,
  });
}

export function createSystemDashboardQuery() {
  return useQuery(() => systemDashboardQueryOptions());
}

export function createImportUnmappedFolderMutation() {
  const queryClient = useQueryClient();
  return useMutation(() => ({
    mutationFn: (data: UnmappedFolderImportRequest) =>
      fetchApi(`${API_BASE}/library/unmapped/import`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: animeKeys.library.unmapped() });
      queryClient.invalidateQueries({ queryKey: animeKeys.lists() });
    },
  }));
}

export function systemLogsQueryOptions(
  page = 1,
  level?: string,
  eventType?: string,
  startDate?: string,
  endDate?: string,
) {
  return queryOptions({
    queryKey: animeKeys.system.logs(page, level, eventType, startDate, endDate),
    queryFn: ({ signal }) => {
      const params = new URLSearchParams({ page: page.toString() });
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
    placeholderData: keepPreviousData,
    staleTime: 1000 * 10,
  });
}

export function createSystemLogsQuery(
  page: () => number,
  level: () => string | undefined,
  eventType: () => string | undefined,
  startDate: () => string | undefined,
  endDate: () => string | undefined,
) {
  return useQuery(() => ({
    ...systemLogsQueryOptions(
      page(),
      level(),
      eventType(),
      startDate(),
      endDate(),
    ),
  }));
}

export function getExportLogsUrl(
  level?: string,
  eventType?: string,
  startDate?: string,
  endDate?: string,
  format: "json" | "csv" = "json",
) {
  const params = new URLSearchParams();
  if (level) params.append("level", level);
  if (eventType) params.append("event_type", eventType);
  if (startDate) params.append("start_date", startDate);
  if (endDate) params.append("end_date", endDate);
  params.append("format", format);
  return `${API_BASE}/system/logs/export?${params.toString()}`;
}

export function createClearLogsMutation() {
  const queryClient = useQueryClient();
  return useMutation(() => ({
    mutationFn: () => fetchApi(`${API_BASE}/system/logs`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: animeKeys.system.all });
    },
  }));
}

export function createScanImportPathMutation() {
  return useMutation(() => ({
    mutationFn: (data: { path: string; anime_id?: number }) =>
      fetchApi<ScanResult>(`${API_BASE}/library/import/scan`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
  }));
}

export function createImportFilesMutation() {
  const queryClient = useQueryClient();
  return useMutation(() => ({
    mutationFn: (files: ImportFileRequest[]) =>
      fetchApi<ImportResult>(`${API_BASE}/library/import`, {
        method: "POST",
        body: JSON.stringify({ files }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: animeKeys.lists() });
      queryClient.invalidateQueries({ queryKey: animeKeys.library.all });
      queryClient.invalidateQueries({ queryKey: animeKeys.system.status() });
    },
  }));
}

export function browsePathQueryOptions(path: string) {
  return queryOptions({
    queryKey: animeKeys.browse(path),
    queryFn: ({ signal }) =>
      fetchApi<BrowseResult>(
        `${API_BASE}/library/browse?path=${encodeURIComponent(path)}`,
        undefined,
        signal,
      ),
    placeholderData: keepPreviousData,
    staleTime: 1000 * 60 * 60,
  });
}

export function createBrowsePathQuery(path: () => string) {
  return useQuery(() => ({ ...browsePathQueryOptions(path()) }));
}

// ==================== Auth API ====================

export function authMeQueryOptions() {
  return queryOptions({
    queryKey: animeKeys.auth.me(),
    queryFn: ({ signal }) =>
      fetchApi<AuthUser>(`${API_BASE}/auth/me`, undefined, signal),
    staleTime: Infinity,
  });
}

export function createAuthMeQuery() {
  return useQuery(authMeQueryOptions);
}

export function authApiKeyQueryOptions() {
  return queryOptions({
    queryKey: animeKeys.auth.apiKey(),
    queryFn: ({ signal }) =>
      fetchApi<ApiKeyResponse>(`${API_BASE}/auth/api-key`, undefined, signal),
    staleTime: Infinity,
  });
}

export function createAuthApiKeyQuery() {
  return useQuery(authApiKeyQueryOptions);
}

export function createLoginMutation() {
  return useMutation(() => ({
    mutationFn: (data: LoginRequest) =>
      fetchApi<LoginResponse>(`${API_BASE}/auth/login`, {
        method: "POST",
        body: JSON.stringify(data),
        skipAutoLogoutOnUnauthorized: true,
      }),
  }));
}

export function createApiKeyLoginMutation() {
  return useMutation(() => ({
    mutationFn: (data: ApiKeyLoginRequest) =>
      fetchApi<LoginResponse>(`${API_BASE}/auth/login/api-key`, {
        method: "POST",
        body: JSON.stringify(data),
        skipAutoLogoutOnUnauthorized: true,
      }),
  }));
}

export function createChangePasswordMutation() {
  return useMutation(() => ({
    mutationFn: (data: ChangePasswordRequest) =>
      fetchApi(`${API_BASE}/auth/password`, {
        method: "PUT",
        body: JSON.stringify(data),
        skipAutoLogoutOnUnauthorized: true,
      }),
  }));
}

export function createRegenerateApiKeyMutation() {
  const queryClient = useQueryClient();
  return useMutation(() => ({
    mutationFn: () =>
      fetchApi<ApiKeyResponse>(`${API_BASE}/auth/api-key/regenerate`, {
        method: "POST",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: animeKeys.auth.apiKey() });
    },
  }));
}

export function renamePreviewQueryOptions(id: number) {
  return queryOptions({
    queryKey: animeKeys.renamePreview(id),
    queryFn: ({ signal }) =>
      fetchApi<RenamePreviewItem[]>(
        `${API_BASE}/anime/${id}/rename-preview`,
        undefined,
        signal,
      ),
  });
}

export function createRenamePreviewQuery(id: () => number) {
  return useQuery(() => ({
    ...renamePreviewQueryOptions(id()),
    enabled: false,
  }));
}

export function createExecuteRenameMutation() {
  const queryClient = useQueryClient();
  return useMutation(() => ({
    mutationFn: (id: number) =>
      fetchApi<RenameResult>(`${API_BASE}/anime/${id}/rename`, {
        method: "POST",
      }),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: animeKeys.episodes(id) });
      queryClient.invalidateQueries({ queryKey: animeKeys.detail(id) });
    },
  }));
}
