import type { DownloadSourceMetadata, ImportedFile, ReleaseProfile, RssFeed } from "@bakarr/shared";

export type {
  ActivityItem,
  Anime,
  AnimeListResponse,
  AnimeSearchResponse,
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
  DownloadEventsPage,
  DownloadSelectionKind,
  DownloadSourceMetadata,
  DownloadStatus,
  Episode,
  EpisodeProgress,
  EpisodeSearchResult,
  FailedImport,
  ImportedFile,
  ImportResult,
  LibraryStats,
  LoginRequest,
  LoginResponse,
  MissingEpisode,
  NyaaSearchResult,
  OpsDashboard,
  ParsedEpisodeIdentity,
  Quality,
  QualityProfile,
  ReleaseProfile,
  ReleaseProfileRule,
  RenamePreviewItem,
  RenameResult,
  RssFeed,
  ScannedFile,
  ScannerState,
  ScanResult,
  SearchResults,
  SkippedFile,
  SystemLog,
  SystemLogsResponse,
  SystemStatus,
  UnmappedFolder,
  VideoFile,
} from "@bakarr/shared";

export interface ScanFolderResult {
  found: number;
  total: number;
}
export type ImportFileRequest = Pick<
  ImportedFile,
  "anime_id" | "episode_number" | "source_path"
> & {
  season?: number;
  episode_numbers?: number[];
  source_metadata?: DownloadSourceMetadata;
};

export type ReleaseProfileCreateRequest = Pick<ReleaseProfile, "is_global" | "name" | "rules">;

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

export interface UnmappedFolderControlRequest {
  action: "pause" | "resume" | "reset" | "refresh";
  path: string;
}

export interface BulkUnmappedFolderControlRequest {
  action: "pause_queued" | "resume_paused" | "reset_failed" | "retry_failed";
}

export interface AddAnimeRequest {
  id: number;
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
  animeId?: number;
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
  animeId?: number;
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
