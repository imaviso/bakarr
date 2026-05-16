import { brandQualityId, type Quality, type QualityProfile } from "@packages/shared/index.ts";
import type { ConfigCore } from "@/features/system/config-codec.ts";
import { DEFAULT_ANIDB_METADATA_CONFIG } from "@/features/system/metadata-providers-config.ts";

export const DEFAULT_QUALITIES: readonly Quality[] = [
  { id: brandQualityId(1), name: "480p", source: "bluray", resolution: 480, rank: 10 },
  { id: brandQualityId(2), name: "720p", source: "bluray", resolution: 720, rank: 20 },
  { id: brandQualityId(3), name: "1080p", source: "bluray", resolution: 1080, rank: 30 },
  { id: brandQualityId(4), name: "2160p", source: "bluray", resolution: 2160, rank: 40 },
];

export const DEFAULT_PROFILES: readonly QualityProfile[] = [
  {
    allowed_qualities: ["1080p", "720p"],
    cutoff: "1080p",
    max_size: null,
    min_size: null,
    name: "Default",
    seadex_preferred: true,
    upgrade_allowed: true,
  },
];

export function makeDefaultConfig(databasePath: string): ConfigCore {
  return {
    general: {
      database_path: databasePath,
      images_path: "./data/images",
      log_level: "info",
      max_db_connections: 4,
      min_db_connections: 1,
      suppress_connection_errors: true,
      worker_threads: 4,
    },
    qbittorrent: {
      default_category: "anime",
      enabled: false,
      password: null,
      ratio_limit: null,
      save_path: null,
      trusted_local: true,
      url: "http://localhost:8080",
      username: "admin",
    },
    nyaa: {
      base_url: "https://nyaa.si",
      default_category: "1_2",
      filter_remakes: true,
      min_seeders: 1,
      preferred_resolution: "1080p",
    },
    scheduler: {
      check_delay_seconds: 5,
      check_interval_minutes: 30,
      cron_expression: null,
      enabled: true,
      max_concurrent_checks: 2,
      metadata_refresh_hours: 24,
    },
    metadata: {
      anidb: {
        ...DEFAULT_ANIDB_METADATA_CONFIG,
      },
    },
    downloads: {
      create_anime_folders: true,
      delete_download_files_after_import: false,
      reconcile_completed_downloads: true,
      remove_torrent_on_import: true,
      remote_path_mappings: [],
      root_path: "./downloads",
    },
    library: {
      auto_scan_interval_hours: 12,
      airing_day_start_hour: 0,
      airing_timezone: "system",
      import_mode: "copy",
      library_path: "./library",
      movie_naming_format: "{title} ({year})",
      naming_format:
        "{title} - S{season:02}E{episode:02} - {episode_title} [{quality} {resolution}][{video_codec}][{audio_codec} {audio_channels}]",
      preferred_title: "romaji",
      recycle_cleanup_days: 30,
      recycle_path: "./recycle-bin",
    },
  };
}
