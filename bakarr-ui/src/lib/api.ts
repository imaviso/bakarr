import {
	keepPreviousData,
	queryOptions,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/solid-query";
import { useAuth } from "~/lib/auth";

// ==================== API Client ====================

const API_BASE = "/api";

async function fetchApi<T>(
	endpoint: string,
	options?: RequestInit,
): Promise<T> {
	const { getAuthHeaders, logout } = useAuth();

	// Standard fetch wrapper
	const res = await fetch(endpoint, {
		...options,
		headers: {
			"Content-Type": "application/json",
			...getAuthHeaders(),
			...options?.headers,
		},
	});

	if (res.status === 401) {
		logout();
		throw new Error("Session expired");
	}

	if (!res.ok) {
		const errorText = await res.text();
		throw new Error(errorText || `API error: ${res.status}`);
	}

	// Backend might wrap responses, but basic endpoints return direct JSON
	const json = await res.json();
	// Check if wrapped in { success: boolean, data: T }
	if (json && typeof json === "object" && "data" in json && "success" in json) {
		if (!json.success) {
			throw new Error(json.error || "Unknown API error");
		}
		return json.data as T;
	}

	return json as T;
}

// ==================== Types ====================

export interface EpisodeProgress {
	downloaded: number; // i64 -> number
	total?: number; // i64 -> number
	missing: number[]; // Vec<i32> -> number[]
}

export interface Anime {
	id: number;
	// anilist_id removed as it's not in DTO (id is the anilist id)
	mal_id?: number;
	title: {
		romaji: string;
		english?: string;
		native?: string;
	};
	format: string;
	description?: string;
	score?: number;
	genres?: string[];
	studios?: string[];
	cover_image?: string;
	banner_image?: string;
	status: string;
	episode_count?: number; // Renamed from episodes_total
	profile_name: string;
	root_folder: string;
	added_at: string;
	monitored: boolean;
	release_profile_ids: number[];
	progress: EpisodeProgress; // Added
}

export interface AnimeSearchResult {
	id: number;
	title: {
		romaji?: string;
		english?: string;
		native?: string;
	};
	format?: string;
	episode_count?: number;
	status?: string;
	cover_image?: string;
	already_in_library?: boolean;
}

export interface Episode {
	// id: number; // Removed - not in DTO
	// anime_id: number; // Removed - not in DTO
	number: number;
	title?: string;
	aired?: string;
	// status: string; // Removed - not in DTO
	downloaded: boolean;
	file_path?: string;
}

export interface LibraryStats {
	total_anime: number;
	total_episodes: number;
	downloaded_episodes: number;
	missing_episodes: number;
	rss_feeds: number;
	recent_downloads: number;
}

export interface ActivityItem {
	id: number;
	activity_type: string;
	anime_id: number;
	anime_title: string;
	episode_number?: number;
	description: string;
	timestamp: string;
}

// ==================== RSS Types ====================

export interface RssFeed {
	id: number;
	anime_id: number;
	url: string;
	name?: string;
	last_checked?: string;
	enabled: boolean;
	created_at: string;
}

// ==================== Calendar Types ====================

export interface CalendarEvent {
	id: string;
	title: string;
	start: string;
	end: string;
	all_day: boolean;
	extended_props: {
		anime_id: number;
		anime_title: string;
		episode_number: number;
		downloaded: boolean;
		anime_image?: string;
	};
}

// ==================== Download Types ====================

export interface Download {
	id: number;
	anime_id: number;
	anime_title: string;
	episode_number: number;
	torrent_name: string;
	status?: string;
	progress?: number;
	added_at?: string;
	download_date?: string;
	group_name?: string;
}

export interface DownloadStatus {
	hash: string;
	name: string;
	progress: number;
	speed: number;
	eta: number;
	state: string;
	total_bytes: number;
	downloaded_bytes: number;
}

// ==================== Hooks ====================

export function libraryStatsQueryOptions() {
	return queryOptions({
		queryKey: ["library", "stats"],
		queryFn: () => fetchApi<LibraryStats>(`${API_BASE}/library/stats`),
	});
}

export function createLibraryStatsQuery() {
	return useQuery(libraryStatsQueryOptions);
}

export function activityQueryOptions() {
	return queryOptions({
		queryKey: ["library", "activity"],
		queryFn: () => fetchApi<ActivityItem[]>(`${API_BASE}/library/activity`),
	});
}

export function createActivityQuery() {
	return useQuery(activityQueryOptions);
}

export function animeListQueryOptions() {
	return queryOptions({
		queryKey: ["anime"],
		queryFn: () => fetchApi<Anime[]>(`${API_BASE}/anime`),
		staleTime: 1000 * 60 * 5, // 5 minutes
	});
}

export function createAnimeListQuery() {
	return useQuery(animeListQueryOptions);
}

export function animeDetailsQueryOptions(id: number) {
	return queryOptions({
		queryKey: ["anime", id],
		queryFn: () => fetchApi<Anime>(`${API_BASE}/anime/${id}`),
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
		queryKey: ["anime", animeId, "episodes"],
		queryFn: () => fetchApi<Episode[]>(`${API_BASE}/anime/${animeId}/episodes`),
	});
}

export function createEpisodesQuery(animeId: () => number) {
	return useQuery(() => ({
		...episodesQueryOptions(animeId()),
		enabled: !!animeId(),
	}));
}

export interface VideoFile {
	name: string;
	path: string;
	size: number;
	episode_number?: number;
}

export function listFilesQueryOptions(animeId: number) {
	return queryOptions({
		queryKey: ["anime", animeId, "files"],
		queryFn: () => fetchApi<VideoFile[]>(`${API_BASE}/anime/${animeId}/files`),
	});
}

export function createListFilesQuery(animeId: () => number) {
	return useQuery(() => ({
		...listFilesQueryOptions(animeId()),
		enabled: !!animeId(),
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
			queryClient.invalidateQueries({
				queryKey: ["anime", animeId, "episodes"],
			});
			queryClient.invalidateQueries({
				queryKey: ["anime", animeId, "files"],
			});
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
			queryClient.invalidateQueries({
				queryKey: ["anime", animeId, "episodes"],
			});
			queryClient.invalidateQueries({
				queryKey: ["anime", animeId, "files"],
			});
		},
	}));
}

export function animeSearchQueryOptions(query: string) {
	return queryOptions({
		queryKey: ["anime", "search", query],
		queryFn: () => {
			return fetchApi<AnimeSearchResult[]>(
				`${API_BASE}/anime/search?q=${encodeURIComponent(query)}`,
			);
		},
		staleTime: 1000 * 60 * 60, // 1 hour
	});
}

export function createAnimeSearchQuery(query: () => string) {
	return useQuery(() => ({
		...animeSearchQueryOptions(query()),
		enabled: query().length >= 3,
	}));
}

export function animeByAnilistIdQueryOptions(id: number) {
	return queryOptions({
		queryKey: ["anime", "anilist", id],
		queryFn: () =>
			fetchApi<AnimeSearchResult>(`${API_BASE}/anime/anilist/${id}`),
		staleTime: 1000 * 60 * 60, // 1 hour
	});
}

export function createAnimeByAnilistIdQuery(id: () => number | null) {
	return useQuery(() => ({
		...animeByAnilistIdQueryOptions(id()!),
		enabled: !!id(),
	}));
}

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
		onSuccess: (newAnime: Anime) => {
			queryClient.setQueryData<Anime[]>(["anime"], (old) => {
				if (!old) return [newAnime];
				return [...old, newAnime].sort((a, b) =>
					a.title.romaji.localeCompare(b.title.romaji),
				);
			});
			queryClient.invalidateQueries({ queryKey: ["system", "status"] });
		},
	}));
}

export function createDeleteAnimeMutation() {
	const queryClient = useQueryClient();
	return useMutation(() => ({
		mutationFn: (id: number) =>
			fetchApi(`${API_BASE}/anime/${id}`, { method: "DELETE" }),
		onMutate: async (id: number) => {
			await queryClient.cancelQueries({ queryKey: ["anime"] });
			const previousAnime = queryClient.getQueryData<Anime[]>(["anime"]);
			queryClient.setQueryData<Anime[]>(["anime"], (old) => {
				if (!old) return [];
				return old.filter((a) => a.id !== id);
			});
			return { previousAnime };
		},
		onError: (
			_err,
			_newTodo,
			context: { previousAnime?: Anime[] } | undefined,
		) => {
			if (context?.previousAnime) {
				queryClient.setQueryData(["anime"], context.previousAnime);
			}
		},
		onSettled: () => {
			queryClient.invalidateQueries({ queryKey: ["anime"] });
			queryClient.invalidateQueries({ queryKey: ["system", "status"] });
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
			await queryClient.cancelQueries({ queryKey: ["anime", id] });
			const previousAnime = queryClient.getQueryData<Anime>(["anime", id]);
			queryClient.setQueryData<Anime>(["anime", id], (old) => {
				if (!old) return old;
				return { ...old, monitored };
			});
			return { previousAnime };
		},
		onError: (_err, { id }, context) => {
			if (context?.previousAnime) {
				queryClient.setQueryData(["anime", id], context.previousAnime);
			}
		},
		onSettled: (_data, _error, { id }) => {
			queryClient.invalidateQueries({ queryKey: ["anime", id] });
			queryClient.invalidateQueries({ queryKey: ["anime"] });
		},
	}));
}

export function createUpdateAnimePathMutation() {
	const queryClient = useQueryClient();
	return useMutation(() => ({
		mutationFn: ({ id, path }: { id: number; path: string }) =>
			fetchApi(`${API_BASE}/anime/${id}/path`, {
				method: "PUT",
				body: JSON.stringify({ path }),
			}),
		onSuccess: (_, { id }) => {
			queryClient.invalidateQueries({ queryKey: ["anime", id] });
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
			await queryClient.cancelQueries({ queryKey: ["anime", id] });
			const previousAnime = queryClient.getQueryData<Anime>(["anime", id]);
			queryClient.setQueryData<Anime>(["anime", id], (old) => {
				if (!old) return old;
				return { ...old, profile_name: profileName };
			});
			return { previousAnime };
		},
		onError: (_err, { id }, context) => {
			if (context?.previousAnime) {
				queryClient.setQueryData(["anime", id], context.previousAnime);
			}
		},
		onSettled: (_data, _error, { id }) => {
			queryClient.invalidateQueries({ queryKey: ["anime", id] });
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
		onMutate: async ({ id, releaseProfileIds }) => {
			await queryClient.cancelQueries({ queryKey: ["anime", id] });
			const previousAnime = queryClient.getQueryData<Anime>(["anime", id]);
			queryClient.setQueryData<Anime>(["anime", id], (old) => {
				if (!old) return old;
				return { ...old, release_profile_ids: releaseProfileIds };
			});
			return { previousAnime };
		},
		onError: (_err, { id }, context) => {
			if (context?.previousAnime) {
				queryClient.setQueryData(["anime", id], context.previousAnime);
			}
		},
		onSettled: (_data, _error, { id }) => {
			queryClient.invalidateQueries({ queryKey: ["anime", id] });
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
		onSuccess: (_, animeId: number) => {
			queryClient.invalidateQueries({
				queryKey: ["anime", animeId],
			});
			queryClient.invalidateQueries({
				queryKey: ["anime"],
			});
		},
	}));
}

export interface ScanFolderResult {
	found: number;
	total: number;
}

export function createScanFolderMutation() {
	const queryClient = useQueryClient();
	return useMutation(() => ({
		mutationFn: (animeId: number) =>
			fetchApi<ScanFolderResult>(`${API_BASE}/anime/${animeId}/episodes/scan`, {
				method: "POST",
			}),
		onSuccess: (_, animeId) => {
			queryClient.invalidateQueries({
				queryKey: ["anime", animeId, "episodes"],
			});
			queryClient.invalidateQueries({
				queryKey: ["anime", animeId],
			});
			queryClient.invalidateQueries({
				queryKey: ["anime"],
			});
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
			queryClient.invalidateQueries({
				queryKey: ["anime", animeId, "episodes"],
			});
		},
	}));
}

// ==================== Rename Hooks ====================

export interface RenamePreviewItem {
	episode_number: number;
	current_path: string;
	new_path: string;
	new_filename: string;
}

export interface RenameResult {
	renamed: number;
	failed: number;
	failures: string[];
}

export function renamePreviewQueryOptions(id: number) {
	return queryOptions({
		queryKey: ["rename-preview", id],
		queryFn: () =>
			fetchApi<RenamePreviewItem[]>(`${API_BASE}/anime/${id}/rename-preview`),
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
			queryClient.invalidateQueries({ queryKey: ["anime", id, "episodes"] });
			queryClient.invalidateQueries({ queryKey: ["anime", id] });
		},
	}));
}

// ==================== Episode Search Helper Hooks ====================

export interface EpisodeSearchResult {
	title: string;
	indexer: string;
	link: string;
	info_hash: string;
	size: number;
	seeders: number;
	leechers: number;
	publish_date: string;
	download_action: DownloadAction;
	quality: string;
	group?: string;
}

export interface NyaaSearchResult {
	title: string;
	magnet: string;
	info_hash: string;
	size: string;
	seeders: number;
	leechers: number;
	pub_date: string;
	view_url: string;
	parsed_episode?: string;
	parsed_group?: string;
	parsed_resolution?: string;
	trusted: boolean;
	is_seadex: boolean;
	is_seadex_best: boolean;
	remake: boolean;
}

export interface DownloadAction {
	Accept?: { quality: Quality; is_seadex: boolean; score: number };
	Upgrade?: {
		quality: Quality;
		is_seadex: boolean;
		score: number;
		reason: string;
		old_file_path?: string;
		old_quality: Quality;
		old_score?: number;
	};
	Reject?: { reason: string };
}

export interface Quality {
	id: number;
	name: string;
	source: string;
	resolution: number;
	rank: number;
}

export interface SearchResults {
	results: NyaaSearchResult[];
	seadex_groups: string[];
}

export function episodeSearchQueryOptions(
	animeId: number,
	episodeNumber: number,
) {
	return queryOptions({
		queryKey: ["search", "episode", animeId, episodeNumber],
		queryFn: () =>
			fetchApi<EpisodeSearchResult[]>(
				`${API_BASE}/search/episode/${animeId}/${episodeNumber}`,
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
		queryKey: [
			"search",
			query,
			options.category,
			options.filter,
			options.anime_id,
		],
		queryFn: () => {
			const params = new URLSearchParams();
			params.append("query", query);
			if (options.anime_id)
				params.append("anime_id", options.anime_id.toString());
			if (options.category) params.append("category", options.category);
			if (options.filter) params.append("filter", options.filter);
			return fetchApi<SearchResults>(
				`${API_BASE}/search/releases?${params.toString()}`,
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
			queryClient.invalidateQueries({ queryKey: ["downloads", "queue"] });
			queryClient.invalidateQueries({ queryKey: ["downloads", "history"] });
			queryClient.invalidateQueries({ queryKey: ["library", "activity"] });
		},
	}));
}

// ==================== Profile & Config Types ====================

export interface QualityProfile {
	cutoff: string;
	upgrade_allowed: boolean;
	seadex_preferred: boolean;
	allowed_qualities: string[];
	name: string;
	min_size?: string | null;
	max_size?: string | null;
}

export interface Config {
	general: {
		database_path: string;
		log_level: string;
		images_path: string;
		suppress_connection_errors: boolean;
		worker_threads: number;
		max_db_connections: number;
		min_db_connections: number;
	};
	qbittorrent: {
		enabled: boolean;
		url: string;
		username: string;
		password?: string | null;
		default_category: string;
	};
	nyaa: {
		base_url: string;
		default_category: string;
		filter_remakes: boolean;
		preferred_resolution?: string | null;
		min_seeders: number;
	};
	scheduler: {
		enabled: boolean;
		check_interval_minutes: number;
		cron_expression?: string | null;
		max_concurrent_checks: number;
		check_delay_seconds: number;
		metadata_refresh_hours: number;
	};
	downloads: {
		root_path: string;
		create_anime_folders: boolean;
		preferred_groups: string[];
		use_seadex: boolean;
		prefer_dual_audio: boolean;
		preferred_codec?: string | null;
		max_size_gb: number;
		remote_path_mappings: string[][];
	};
	library: {
		library_path: string;
		recycle_path: string;
		recycle_cleanup_days: number;
		naming_format: string;
		import_mode: string;
		movie_naming_format: string;
		auto_scan_interval_hours: number;
		preferred_title: string;
	};
	// profiles are handled separately but present in full config
	profiles: QualityProfile[];
}

// ==================== Profile & Config Hooks ====================

export function profilesQueryOptions() {
	return queryOptions({
		queryKey: ["profiles"],
		queryFn: () => fetchApi<QualityProfile[]>(`${API_BASE}/profiles`),
		staleTime: Infinity,
	});
}

export function createProfilesQuery() {
	return useQuery(profilesQueryOptions);
}

export function qualitiesQueryOptions() {
	return queryOptions({
		queryKey: ["profiles", "qualities"],
		queryFn: () => fetchApi<Quality[]>(`${API_BASE}/profiles/qualities`),
		staleTime: Infinity,
	});
}

export function createQualitiesQuery() {
	return useQuery(qualitiesQueryOptions);
}

export function systemConfigQueryOptions() {
	return queryOptions({
		queryKey: ["system", "config"],
		queryFn: () => fetchApi<Config>(`${API_BASE}/system/config`),
		staleTime: Infinity,
		placeholderData: keepPreviousData,
	});
}

export function createSystemConfigQuery() {
	return useQuery(systemConfigQueryOptions);
}

export function createUpdateSystemConfigMutation() {
	const queryClient = useQueryClient();
	return useMutation(() => ({
		mutationFn: (data: Config) =>
			fetchApi<void>(`${API_BASE}/system/config`, {
				method: "PUT",
				body: JSON.stringify(data),
			}),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["system", "config"] });
		},
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
			queryClient.invalidateQueries({ queryKey: ["profiles"] });
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
			queryClient.invalidateQueries({ queryKey: ["profiles"] });
		},
	}));
}

export function createDeleteProfileMutation() {
	const queryClient = useQueryClient();
	return useMutation(() => ({
		mutationFn: (name: string) =>
			fetchApi(`${API_BASE}/profiles/${name}`, { method: "DELETE" }),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["profiles"] });
		},
	}));
}

// ==================== Release Profile Types ====================

export interface ReleaseProfileRule {
	term: string;
	score: number;
	rule_type: "preferred" | "must" | "must_not";
}

export interface ReleaseProfile {
	id: number;
	name: string;
	enabled: boolean;
	is_global: boolean;
	rules: ReleaseProfileRule[];
}

// ==================== Release Profile Hooks ====================

export function releaseProfilesQueryOptions() {
	return queryOptions({
		queryKey: ["release-profiles"],
		queryFn: () => fetchApi<ReleaseProfile[]>(`${API_BASE}/release-profiles`),
	});
}

export function createReleaseProfilesQuery() {
	return useQuery(releaseProfilesQueryOptions);
}

export function createCreateReleaseProfileMutation() {
	const queryClient = useQueryClient();
	return useMutation(() => ({
		mutationFn: (data: {
			name: string;
			rules: ReleaseProfileRule[];
			is_global: boolean;
		}) =>
			fetchApi<ReleaseProfile>(`${API_BASE}/release-profiles`, {
				method: "POST",
				body: JSON.stringify(data),
			}),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["release-profiles"] });
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
			data: {
				name: string;
				enabled: boolean;
				is_global: boolean;
				rules: ReleaseProfileRule[];
			};
		}) =>
			fetchApi(`${API_BASE}/release-profiles/${id}`, {
				method: "PUT",
				body: JSON.stringify(data),
			}),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["release-profiles"] });
		},
	}));
}

export function createDeleteReleaseProfileMutation() {
	const queryClient = useQueryClient();
	return useMutation(() => ({
		mutationFn: (id: number) =>
			fetchApi(`${API_BASE}/release-profiles/${id}`, { method: "DELETE" }),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["release-profiles"] });
		},
	}));
}

// ==================== RSS Hooks ====================

export function rssFeedsQueryOptions() {
	return queryOptions({
		queryKey: ["rss"],
		queryFn: () => fetchApi<RssFeed[]>(`${API_BASE}/rss`),
	});
}

export function createRssFeedsQuery() {
	return useQuery(rssFeedsQueryOptions);
}

export function animeRssFeedsQueryOptions(animeId: number) {
	return queryOptions({
		queryKey: ["rss", "anime", animeId],
		queryFn: () => fetchApi<RssFeed[]>(`${API_BASE}/anime/${animeId}/rss`),
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
		mutationFn: (data: { anime_id: number; url: string; name?: string }) =>
			fetchApi<RssFeed>(`${API_BASE}/rss`, {
				method: "POST",
				body: JSON.stringify(data),
			}),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["rss"] });
		},
	}));
}

export function createDeleteRssFeedMutation() {
	const queryClient = useQueryClient();
	return useMutation(() => ({
		mutationFn: (id: number) =>
			fetchApi(`${API_BASE}/rss/${id}`, { method: "DELETE" }),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["rss"] });
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
			queryClient.invalidateQueries({ queryKey: ["rss"] });
		},
	}));
}

// ==================== Calendar Hooks ====================

export function calendarQueryOptions(start: Date, end: Date) {
	return queryOptions({
		queryKey: ["calendar", start.toISOString(), end.toISOString()],
		queryFn: () => {
			const params = new URLSearchParams({
				start: start.toISOString(),
				end: end.toISOString(),
			});
			return fetchApi<CalendarEvent[]>(`${API_BASE}/calendar?${params}`);
		},
	});
}

export function createCalendarQuery(start: () => Date, end: () => Date) {
	return useQuery(() => ({
		...calendarQueryOptions(start(), end()),
	}));
}

// ==================== Download Hooks ====================

export function downloadQueueQueryOptions() {
	return queryOptions({
		queryKey: ["downloads", "queue"],
		queryFn: () => fetchApi<Download[]>(`${API_BASE}/downloads/queue`),
		refetchInterval: 5000,
	});
}

export function createDownloadQueueQuery() {
	return useQuery(downloadQueueQueryOptions);
}

export function downloadHistoryQueryOptions() {
	return queryOptions({
		queryKey: ["downloads", "history"],
		queryFn: () => fetchApi<Download[]>(`${API_BASE}/downloads/history`),
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
			queryClient.invalidateQueries({ queryKey: ["downloads"] });
		},
	}));
}

// ==================== Wanted Hooks ====================

export interface MissingEpisode {
	anime_id: number;
	anime_title: string;
	episode_number: number;
	episode_title?: string;
	aired?: string;
	anime_image?: string;
}

export function wantedQueryOptions(limit = 100) {
	return queryOptions({
		queryKey: ["wanted", limit],
		queryFn: () =>
			fetchApi<MissingEpisode[]>(`${API_BASE}/wanted/missing?limit=${limit}`),
	});
}

export function createWantedQuery(limit: () => number) {
	return useQuery(() => wantedQueryOptions(limit()));
}

// ==================== Library Scan Hooks ====================

export interface UnmappedFolder {
	name: string;
	path: string;
	size: number;
	suggested_matches: AnimeSearchResult[];
}

export interface ScannerState {
	is_scanning: boolean;
	folders: UnmappedFolder[];
	last_updated?: string;
}

export function unmappedFoldersQueryOptions() {
	return queryOptions({
		queryKey: ["library", "unmapped"],
		queryFn: () => fetchApi<ScannerState>(`${API_BASE}/library/unmapped`),
		refetchInterval: (query) => {
			if (query.state.data?.is_scanning) {
				return 1000;
			}
			return false;
		},
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
			queryClient.invalidateQueries({ queryKey: ["library", "unmapped"] });
		},
	}));
}

export function createImportUnmappedFolderMutation() {
	const queryClient = useQueryClient();
	return useMutation(() => ({
		mutationFn: (data: {
			folder_name: string;
			anime_id: number;
			profile_name?: string;
		}) =>
			fetchApi(`${API_BASE}/library/unmapped/import`, {
				method: "POST",
				body: JSON.stringify(data),
			}),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["library", "unmapped"] });
			queryClient.invalidateQueries({ queryKey: ["anime"] });
		},
	}));
}

// ==================== System Logs Hooks ====================

export interface SystemLog {
	id: number;
	event_type: string;
	level: "info" | "warn" | "error" | "success";
	message: string;
	details?: string;
	created_at: string;
}

export interface SystemLogsResponse {
	logs: SystemLog[];
	total_pages: number;
}

export function systemLogsQueryOptions(
	page = 1,
	level?: string,
	eventType?: string,
	startDate?: string,
	endDate?: string,
) {
	return queryOptions({
		queryKey: ["system", "logs", page, level, eventType, startDate, endDate],
		queryFn: () => {
			const params = new URLSearchParams();
			params.append("page", page.toString());
			if (level) params.append("level", level);
			if (eventType) params.append("event_type", eventType);
			if (startDate) params.append("start_date", startDate);
			if (endDate) params.append("end_date", endDate);
			return fetchApi<SystemLogsResponse>(
				`${API_BASE}/system/logs?${params.toString()}`,
			);
		},
		placeholderData: keepPreviousData,
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
		mutationFn: () =>
			fetchApi<boolean>(`${API_BASE}/system/logs`, { method: "DELETE" }),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["system", "logs"] });
		},
	}));
}

export interface BrowseEntry {
	name: string;
	path: string;
	is_directory: boolean;
	size?: number;
}

export interface BrowseResult {
	current_path: string;
	parent_path?: string;
	entries: BrowseEntry[];
}

export interface ScannedFile {
	source_path: string;
	filename: string;
	parsed_title: string;
	episode_number: number;
	season?: number;
	group?: string;
	resolution?: string;
	matched_anime?: {
		id: number;
		title: string;
	};
	suggested_candidate_id?: number;
}

export interface SkippedFile {
	path: string;
	reason: string;
}

export interface ScanResult {
	files: ScannedFile[];
	skipped: SkippedFile[];
	candidates: AnimeSearchResult[];
}

export interface ImportFileRequest {
	source_path: string;
	anime_id: number;
	episode_number: number;
	season?: number;
}

export interface ImportedFile {
	source_path: string;
	destination_path: string;
	anime_id: number;
	episode_number: number;
}

export interface FailedImport {
	source_path: string;
	error: string;
}

export interface ImportResult {
	imported: number;
	failed: number;
	imported_files: ImportedFile[];
	failed_files: FailedImport[];
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
			// Invalidate relevant queries after import
			queryClient.invalidateQueries({ queryKey: ["anime"] });
			queryClient.invalidateQueries({ queryKey: ["library", "stats"] });
			queryClient.invalidateQueries({ queryKey: ["library", "activity"] });
			queryClient.invalidateQueries({ queryKey: ["downloads", "history"] });
			queryClient.invalidateQueries({ queryKey: ["system", "status"] });
		},
	}));
}

export function browsePathQueryOptions(path: string) {
	return queryOptions({
		queryKey: ["browse", path],
		queryFn: () =>
			fetchApi<BrowseResult>(
				`${API_BASE}/library/browse?path=${encodeURIComponent(path)}`,
			),
		placeholderData: keepPreviousData,
	});
}

export function createBrowsePathQuery(path: () => string) {
	return useQuery(() => ({
		...browsePathQueryOptions(path()),
	}));
}
export interface SystemStatus {
	version: string;
	uptime: number;
	active_torrents: number;
	pending_downloads: number;
	disk_space: {
		free: number;
		total: number;
	};
	last_scan?: string | null;
	last_rss?: string | null;
}

export function systemStatusQueryOptions() {
	return queryOptions({
		queryKey: ["system", "status"],
		queryFn: () => fetchApi<SystemStatus>(`${API_BASE}/system/status`),
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

// ==================== Auth API ====================

export interface AuthUser {
	id: number;
	username: string;
	created_at: string;
	updated_at: string;
}

export interface ApiKeyResponse {
	api_key: string;
}

export function authMeQueryOptions() {
	return queryOptions({
		queryKey: ["auth", "me"],
		queryFn: () => fetchApi<AuthUser>(`${API_BASE}/auth/me`),
		staleTime: Infinity,
	});
}

export function createAuthMeQuery() {
	return useQuery(authMeQueryOptions);
}

export function authApiKeyQueryOptions() {
	return queryOptions({
		queryKey: ["auth", "api-key"],
		queryFn: () => fetchApi<ApiKeyResponse>(`${API_BASE}/auth/api-key`),
		staleTime: Infinity,
	});
}

export function createAuthApiKeyQuery() {
	return useQuery(authApiKeyQueryOptions);
}

export function createChangePasswordMutation() {
	return useMutation(() => ({
		mutationFn: (data: { current_password: string; new_password: string }) =>
			fetchApi<void>(`${API_BASE}/auth/password`, {
				method: "PUT",
				body: JSON.stringify(data),
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
			queryClient.invalidateQueries({ queryKey: ["auth", "api-key"] });
		},
	}));
}
