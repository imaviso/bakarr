import type {
  DownloadSourceMetadata,
  ImportedFile,
  MediaKind,
  ReleaseProfile,
  RssFeed,
} from "@bakarr/shared";

export type * from "@bakarr/shared";

export const SEARCH_RELEASE_CATEGORY_OPTIONS = [
  "all_anime",
  "anime_english",
  "anime_non_english",
  "anime_raw",
  "all_literature",
  "literature_english",
  "literature_non_english",
  "literature_raw",
] as const;

export type SearchReleaseCategory = (typeof SEARCH_RELEASE_CATEGORY_OPTIONS)[number];

export const SEARCH_RELEASE_CATEGORY_LABELS: Record<SearchReleaseCategory, string> = {
  all_anime: "All Anime",
  anime_english: "Anime (English)",
  anime_non_english: "Anime (Non-Eng)",
  anime_raw: "Anime (Raw)",
  all_literature: "All Literature",
  literature_english: "Literature (English)",
  literature_non_english: "Literature (Non-Eng)",
  literature_raw: "Literature (Raw)",
};

export const SEARCH_RELEASE_FILTER_OPTIONS = ["no_filter", "no_remakes", "trusted_only"] as const;

export type SearchReleaseFilter = (typeof SEARCH_RELEASE_FILTER_OPTIONS)[number];

export const SEARCH_RELEASE_FILTER_LABELS: Record<SearchReleaseFilter, string> = {
  no_filter: "No Filter",
  no_remakes: "No Remakes",
  trusted_only: "Trusted Only",
};

export const DOWNLOAD_EVENT_TYPE_FILTER_OPTIONS = [
  "all",
  "download.queued",
  "download.imported",
  "download.imported.batch",
  "download.retried",
  "download.status_changed",
  "download.coverage_refined",
  "download.deleted",
  "download.search_missing.queued",
  "download.rss.queued",
] as const;

export type DownloadEventTypeFilterOption = (typeof DOWNLOAD_EVENT_TYPE_FILTER_OPTIONS)[number];

export const SEASONAL_ANIME_PROVIDER_VALUES = ["anilist", "jikan_fallback"] as const;

export type SeasonalMediaProvider = (typeof SEASONAL_ANIME_PROVIDER_VALUES)[number];

export const MAX_UNMAPPED_FOLDER_MATCH_ATTEMPTS = 3;

export interface ScanFolderResult {
  found: number;
  total: number;
}
export type ImportFileRequest = Pick<ImportedFile, "media_id" | "unit_number" | "source_path"> & {
  season?: number | undefined;
  unit_numbers?: number[] | undefined;
  source_metadata?: DownloadSourceMetadata | undefined;
};

export type ReleaseProfileCreateRequest = Pick<ReleaseProfile, "is_global" | "name" | "rules">;

export type ReleaseProfileUpdateRequest = Pick<
  ReleaseProfile,
  "enabled" | "is_global" | "name" | "rules"
>;

export type RssFeedCreateRequest = Pick<RssFeed, "media_id" | "name" | "url">;

export interface UnmappedFolderImportRequest {
  folder_name: string;
  media_id: number;
  profile_name?: string;
}

export interface UnmappedFolderControlRequest {
  action: "pause" | "resume" | "reset" | "refresh";
  path: string;
}

export interface BulkUnmappedFolderControlRequest {
  action: "pause_queued" | "resume_paused" | "reset_failed" | "retry_failed";
}

export interface AddAnimeRequest {
  id: number;
  media_kind?: MediaKind;
  profile_name: string;
  root_folder: string;
  monitor_and_search: boolean;
  monitored: boolean;
  release_profile_ids: number[];
  use_existing_root?: boolean;
}

export interface AnimeEpisodeStreamUrl {
  url: string;
}

export interface DownloadEventsFilterInput {
  mediaId?: number;
  cursor?: string;
  downloadId?: number;
  direction?: "next" | "prev";
  endDate?: string;
  eventType?: string;
  limit?: number;
  startDate?: string;
  status?: string;
}

export interface DownloadEventsExportInput {
  mediaId?: number;
  downloadId?: number;
  endDate?: string;
  eventType?: string;
  limit?: number;
  order?: "asc" | "desc";
  startDate?: string;
  status?: string;
}

export interface DownloadEventsExportResult {
  exported: number;
  format: "json" | "csv";
  generatedAt?: string;
  limit: number;
  total: number;
  truncated: boolean;
}
