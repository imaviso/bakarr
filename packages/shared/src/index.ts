export type ApiResult<T> =
  | {
    ok: true;
    data: T;
  }
  | {
    ok: false;
    error: string;
  };

export interface HealthStatus {
  status: "ok";
}

export interface AuthUser {
  id: number;
  username: string;
  created_at: string;
  updated_at: string;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface ApiKeyLoginRequest {
  api_key: string;
}

export interface LoginResponse {
  username: string;
  api_key: string;
  must_change_password: boolean;
}

export interface ChangePasswordRequest {
  current_password: string;
  new_password: string;
}

export interface ApiKeyResponse {
  api_key: string;
}

export interface EpisodeProgress {
  downloaded: number;
  total?: number;
  missing: number[];
}

export interface Anime {
  id: number;
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
  episode_count?: number;
  profile_name: string;
  root_folder: string;
  added_at: string;
  monitored: boolean;
  release_profile_ids: number[];
  progress: EpisodeProgress;
}

export interface Episode {
  number: number;
  title?: string;
  aired?: string;
  downloaded: boolean;
  file_path?: string;
}

export interface VideoFile {
  name: string;
  path: string;
  size: number;
  episode_number?: number;
}

export interface RssFeed {
  id: number;
  anime_id: number;
  url: string;
  name?: string;
  last_checked?: string;
  enabled: boolean;
  created_at: string;
}

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

export interface Download {
  id: number;
  anime_id: number;
  anime_title: string;
  episode_number: number;
  torrent_name: string;
  is_batch?: boolean;
  covered_episodes?: number[];
  status?: string;
  progress?: number;
  added_at?: string;
  download_date?: string;
  group_name?: string;
  external_state?: string;
  error_message?: string;
  save_path?: string;
  content_path?: string;
  total_bytes?: number;
  downloaded_bytes?: number;
  speed_bytes?: number;
  eta_seconds?: number;
  last_synced_at?: string;
  retry_count?: number;
  last_error_at?: string;
  reconciled_at?: string;
}

export interface LibraryRoot {
  id: number;
  label: string;
  path: string;
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

export interface Quality {
  id: number;
  name: string;
  source: string;
  resolution: number;
  rank: number;
}

export interface QualityProfile {
  cutoff: string;
  upgrade_allowed: boolean;
  seadex_preferred: boolean;
  allowed_qualities: string[];
  name: string;
  min_size?: string | null;
  max_size?: string | null;
}

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
    reconcile_completed_downloads?: boolean;
    remove_torrent_on_import?: boolean;
    delete_download_files_after_import?: boolean;
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
  security: {
    argon2_memory_cost_kib: number;
    argon2_time_cost: number;
    argon2_parallelism: number;
    auto_migrate_password_hashes: boolean;
    auth_throttle: {
      max_attempts: number;
      window_seconds: number;
      lockout_seconds: number;
      login_base_delay_ms: number;
      login_max_delay_ms: number;
      password_base_delay_ms: number;
      password_max_delay_ms: number;
      trusted_proxy_ips: string[];
    };
  };
  profiles: QualityProfile[];
}

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

export interface BackgroundJobStatus {
  name: string;
  is_running: boolean;
  last_run_at?: string;
  last_success_at?: string;
  last_status?: string;
  last_message?: string;
  run_count: number;
  schedule_mode?: "cron" | "interval" | "manual" | "disabled";
  schedule_value?: string;
}

export interface DownloadEvent {
  id: number;
  download_id?: number;
  anime_id?: number;
  event_type: string;
  from_status?: string;
  to_status?: string;
  message: string;
  metadata?: string;
  created_at: string;
}

export interface OpsDashboard {
  queued_downloads: number;
  active_downloads: number;
  failed_downloads: number;
  imported_downloads: number;
  running_jobs: number;
  recent_download_events: DownloadEvent[];
  jobs: BackgroundJobStatus[];
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

export interface MissingEpisode {
  anime_id: number;
  anime_title: string;
  episode_number: number;
  episode_title?: string;
  aired?: string;
  anime_image?: string;
}

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

export interface SearchResults {
  results: NyaaSearchResult[];
  seadex_groups: string[];
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

export interface DownloadStatus {
  id?: number;
  hash: string;
  name: string;
  progress: number;
  speed: number;
  eta: number;
  state: string;
  total_bytes: number;
  downloaded_bytes: number;
}

export type NotificationEvent =
  | { type: "ScanStarted" }
  | { type: "ScanFinished" }
  | { type: "ScanProgress"; payload: { current: number; total: number } }
  | { type: "DownloadStarted"; payload: { title: string; anime_id?: number } }
  | { type: "DownloadFinished"; payload: { title: string; anime_id?: number } }
  | { type: "RefreshStarted"; payload: { anime_id: number; title: string } }
  | { type: "RefreshFinished"; payload: { anime_id: number; title: string } }
  | {
    type: "SearchMissingStarted";
    payload: { anime_id: number; title: string };
  }
  | {
    type: "SearchMissingFinished";
    payload: { anime_id: number; title: string; count: number };
  }
  | { type: "ScanFolderStarted"; payload: { anime_id: number; title: string } }
  | {
    type: "ScanFolderFinished";
    payload: { anime_id: number; title: string; found: number };
  }
  | { type: "RenameStarted"; payload: { anime_id: number; title: string } }
  | {
    type: "RenameFinished";
    payload: { anime_id: number; title: string; count: number };
  }
  | { type: "ImportStarted"; payload: { count: number } }
  | {
    type: "ImportFinished";
    payload: { count: number; imported: number; failed: number };
  }
  | { type: "LibraryScanStarted" }
  | {
    type: "LibraryScanFinished";
    payload: { scanned: number; matched: number; updated?: number };
  }
  | { type: "LibraryScanProgress"; payload: { scanned: number } }
  | { type: "RssCheckStarted" }
  | {
    type: "RssCheckFinished";
    payload: { total_feeds?: number; new_items: number };
  }
  | {
    type: "RssCheckProgress";
    payload: { current: number; total: number; feed_name: string };
  }
  | { type: "Error"; payload: { message: string } }
  | { type: "Info"; payload: { message: string } }
  | { type: "DownloadProgress"; payload: { downloads: DownloadStatus[] } }
  | { type: "SystemStatus"; payload: SystemStatus };
