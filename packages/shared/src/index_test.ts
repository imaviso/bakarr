import { assertEquals, assertMatch, it } from "./test/vitest";
import { Schema } from "effect";

import {
  ActivityItemSchema,
  AnimeSchema,
  AnimeSearchResultSchema,
  ApiKeyLoginRequestSchema,
  ApiKeyResponseSchema,
  AuthUserSchema,
  BackgroundJobStatusSchema,
  BrowseResultSchema,
  CalendarEventSchema,
  ChangePasswordRequestSchema,
  ConfigSchema,
  DownloadActionSchema,
  DownloadEventSchema,
  DownloadEventsExportSchema,
  DownloadEventsPageSchema,
  DownloadSchema,
  DownloadStatusSchema,
  EpisodeSchema,
  EpisodeSearchResultSchema,
  HealthStatusSchema,
  ImportModeSchema,
  ImportResultSchema,
  LibraryRootSchema,
  LibraryStatsSchema,
  LoginRequestSchema,
  LoginResponseSchema,
  MissingEpisodeSchema,
  NotificationEventSchema,
  OpsDashboardSchema,
  PreferredTitleSchema,
  QualityProfileSchema,
  QualitySchema,
  ReleaseProfileSchema,
  RenamePreviewItemSchema,
  RenameResultSchema,
  RssFeedSchema,
  RuleTypeSchema,
  ScannedFileSchema,
  ScannerStateSchema,
  ScanResultSchema,
  SearchResultsSchema,
  SkippedFileSchema,
  SystemLogSchema,
  SystemLogsResponseSchema,
  SystemStatusSchema,
  UnmappedFolderSchema,
  VideoFileSchema,
} from "./index";

it("shared config schemas accept canonical literal values", () => {
  const importMode = Schema.decodeUnknownEither(ImportModeSchema)("copy");
  const preferredTitle = Schema.decodeUnknownEither(PreferredTitleSchema)(
    "english",
  );
  const ruleType = Schema.decodeUnknownEither(RuleTypeSchema)("must_not");

  assertEquals(importMode._tag, "Right");
  assertEquals(preferredTitle._tag, "Right");
  assertEquals(ruleType._tag, "Right");
});

it("shared config schemas reject unsupported literals", () => {
  const importMode = Schema.decodeUnknownEither(ImportModeSchema)("link");
  const preferredTitle = Schema.decodeUnknownEither(PreferredTitleSchema)(
    "kana",
  );

  assertEquals(importMode._tag, "Left");
  assertEquals(preferredTitle._tag, "Left");

  if (importMode._tag === "Left") {
    assertMatch(importMode.left.message, /copy|move/);
  }

  if (preferredTitle._tag === "Left") {
    assertMatch(preferredTitle.left.message, /romaji|english|native/);
  }
});

it("shared api schemas accept canonical system and download payloads", () => {
  const downloadEvent = Schema.decodeUnknownEither(DownloadEventSchema)({
    anime_id: 20,
    anime_image: "https://example.com/naruto.jpg",
    anime_title: "Naruto",
    created_at: "2024-01-01T00:00:00.000Z",
    download_id: 4,
    event_type: "download.started",
    from_status: "queued",
    id: 8,
    message: "Started Naruto - 01",
    metadata: '{"source":"rss"}',
    metadata_json: {
      covered_episodes: [1],
      imported_path: "/library/Naruto/Naruto - 01.mkv",
      source_metadata: {
        group: "SubsPlease",
        indexer: "Nyaa",
        quality: "WEB-DL 1080p",
      },
    },
    torrent_name: "Naruto - 01",
    to_status: "downloading",
  });
  const downloadEventsPage = Schema.decodeUnknownEither(
    DownloadEventsPageSchema,
  )({
    events: [{
      anime_id: 20,
      created_at: "2024-01-01T00:00:00.000Z",
      event_type: "download.queued",
      id: 8,
      message: "Queued Naruto - 01",
    }],
    has_more: true,
    limit: 25,
    next_cursor: "7",
    prev_cursor: "9",
    total: 80,
  });
  const downloadEventsExport = Schema.decodeUnknownEither(
    DownloadEventsExportSchema,
  )({
    events: [{
      anime_id: 20,
      created_at: "2024-01-01T00:00:00.000Z",
      event_type: "download.queued",
      id: 8,
      message: "Queued Naruto - 01",
    }],
    exported: 1,
    generated_at: "2024-01-01T00:01:00.000Z",
    limit: 1000,
    order: "desc",
    total: 80,
    truncated: false,
  });
  const downloadStatus = Schema.decodeUnknownEither(DownloadStatusSchema)({
    anime_id: 20,
    anime_image: "https://example.com/naruto.jpg",
    anime_title: "Naruto",
    decision_reason: "Accepted (WEB-DL 1080p, score 12)",
    downloaded_bytes: 512,
    eta: 60,
    hash: "abcdef",
    id: 1,
    imported_path: "/library/Naruto/Naruto - 01.mkv",
    name: "Naruto - 01",
    progress: 0.5,
    speed: 1024,
    state: "downloading",
    total_bytes: 1024,
  });
  const systemStatus = Schema.decodeUnknownEither(SystemStatusSchema)({
    active_torrents: 1,
    disk_space: {
      free: 512,
      total: 1024,
    },
    last_rss: null,
    last_scan: "2024-01-01T00:00:00.000Z",
    pending_downloads: 2,
    uptime: 42,
    version: "0.1.0",
  });

  assertEquals(downloadEvent._tag, "Right");
  assertEquals(downloadEventsPage._tag, "Right");
  assertEquals(downloadEventsExport._tag, "Right");
  assertEquals(downloadStatus._tag, "Right");
  assertEquals(systemStatus._tag, "Right");
});

it("shared api schemas reject invalid download payloads", () => {
  const downloadStatus = Schema.decodeUnknownEither(DownloadStatusSchema)({
    downloaded_bytes: 512,
    eta: 60,
    hash: "abcdef",
    id: 1,
    name: "Naruto - 01",
    progress: "half",
    speed: 1024,
    state: "downloading",
    total_bytes: 1024,
  });

  assertEquals(downloadStatus._tag, "Left");

  if (downloadStatus._tag === "Left") {
    assertMatch(downloadStatus.left.message, /progress/i);
  }
});

it("shared dashboard and browse schemas accept canonical payloads", () => {
  const rssFeed = Schema.decodeUnknownEither(RssFeedSchema)({
    anime_id: 20,
    created_at: "2024-01-01T00:00:00.000Z",
    enabled: true,
    id: 1,
    last_checked: "2024-01-02T00:00:00.000Z",
    name: "Main feed",
    url: "https://example.com/feed.xml",
  });
  const libraryStats = Schema.decodeUnknownEither(LibraryStatsSchema)({
    downloaded_episodes: 8,
    downloaded_percent: 67,
    missing_episodes: 4,
    monitored_anime: 3,
    recent_downloads: 2,
    rss_feeds: 3,
    total_anime: 5,
    total_episodes: 12,
    up_to_date_anime: 2,
  });
  const backgroundJob = {
    is_running: false,
    last_message: "Completed successfully",
    last_run_at: "2024-01-02T00:00:00.000Z",
    last_status: "success",
    last_success_at: "2024-01-02T00:00:01.000Z",
    name: "rss",
    run_count: 7,
    schedule_mode: "interval",
    schedule_value: "30m",
  };
  const dashboard = Schema.decodeUnknownEither(OpsDashboardSchema)({
    active_downloads: 1,
    failed_downloads: 0,
    imported_downloads: 3,
    jobs: [backgroundJob],
    queued_downloads: 2,
    recent_download_events: [{
      anime_id: 20,
      created_at: "2024-01-01T00:00:00.000Z",
      download_id: 4,
      event_type: "download.started",
      from_status: "queued",
      id: 8,
      message: "Started Naruto - 01",
      metadata: '{"source":"rss"}',
      to_status: "downloading",
    }],
    running_jobs: 1,
  });
  const browse = Schema.decodeUnknownEither(BrowseResultSchema)({
    current_path: "/library",
    entries: [
      {
        is_directory: true,
        name: "Naruto",
        path: "/library/Naruto",
      },
      {
        is_directory: false,
        name: "notes.txt",
        path: "/library/notes.txt",
        size: 5,
      },
    ],
    has_more: false,
    limit: 100,
    offset: 0,
    parent_path: "/",
    total: 2,
  });
  const backgroundJobStatus = Schema.decodeUnknownEither(
    BackgroundJobStatusSchema,
  )(backgroundJob);

  assertEquals(rssFeed._tag, "Right");
  assertEquals(libraryStats._tag, "Right");
  assertEquals(backgroundJobStatus._tag, "Right");
  assertEquals(dashboard._tag, "Right");
  assertEquals(browse._tag, "Right");
});

it("shared search and scanner schemas accept canonical payloads", () => {
  const animeSearchResult = {
    already_in_library: true,
    banner_image: "https://example.com/naruto-banner.jpg",
    cover_image: "https://example.com/naruto.jpg",
    description: "A ninja story",
    end_year: 2024,
    episode_count: 12,
    format: "TV",
    genres: ["Action", "Adventure"],
    id: 20,
    match_confidence: 0.94,
    match_reason: "Matched AniList search for the normalized folder title",
    recommended_anime: [{
      id: 22,
      rating: 82,
      title: {
        english: "Bleach",
        romaji: "Bleach",
      },
    }],
    related_anime: [{
      id: 21,
      relation_type: "SEQUEL",
      season: "spring",
      season_year: 2025,
      start_year: 2025,
      status: "NOT_YET_RELEASED",
      title: {
        english: "Naruto Shippuden",
        romaji: "Naruto Shippuden",
      },
    }],
    season: "winter",
    season_year: 2024,
    start_date: "2024-01-07",
    start_year: 2024,
    status: "RELEASING",
    synonyms: ["Naruto Alt"],
    title: {
      english: "Naruto",
      romaji: "Naruto",
    },
  };
  const anime = Schema.decodeUnknownEither(AnimeSearchResultSchema)(
    animeSearchResult,
  );
  const searchResults = Schema.decodeUnknownEither(SearchResultsSchema)({
    results: [{
      info_hash: "abcdefabcdefabcdefabcdefabcdefabcdefabcd",
      indexer: "Nyaa",
      is_seadex: false,
      is_seadex_best: false,
      leechers: 1,
      magnet: "magnet:?xt=urn:btih:abcdef",
      parsed_episode: "1",
      parsed_episode_numbers: [1, 2, 3],
      parsed_group: "SubsPlease",
      parsed_quality: "WEB-DL 1080p",
      parsed_resolution: "1080p",
      pub_date: "2024-01-01T00:00:00.000Z",
      remake: false,
      seadex_comparison: "https://releases.moe/compare/example",
      seadex_dual_audio: true,
      seadex_notes: "Preferred release",
      seadex_tags: ["Best"],
      seeders: 55,
      size: "1.3 GiB",
      title: "[SubsPlease] Naruto - 001 (1080p)",
      trusted: true,
      view_url: "https://nyaa.si/view/1",
    }],
    seadex_groups: ["SubsPlease"],
  });
  const scannerState = Schema.decodeUnknownEither(ScannerStateSchema)({
    folders: [{
      match_attempts: 1,
      last_matched_at: "2024-01-01T00:00:00.000Z",
      match_status: "done",
      name: "Naruto",
      path: "/imports/Naruto",
      size: 1024,
      suggested_matches: [animeSearchResult],
    }],
    has_outstanding_matches: true,
    is_scanning: true,
    last_updated: "2024-01-01T00:00:00.000Z",
  });

  assertEquals(anime._tag, "Right");
  assertEquals(searchResults._tag, "Right");
  assertEquals(scannerState._tag, "Right");
});

it("shared nested dto schemas reject invalid payloads", () => {
  const backgroundJob = Schema.decodeUnknownEither(BackgroundJobStatusSchema)({
    is_running: false,
    name: "rss",
    progress_current: 1,
    progress_total: 5,
    run_count: 7,
    schedule_mode: "weekly",
  });
  const searchResults = Schema.decodeUnknownEither(SearchResultsSchema)({
    results: [{
      info_hash: "abcdefabcdefabcdefabcdefabcdefabcdefabcd",
      indexer: "Nyaa",
      is_seadex: false,
      is_seadex_best: false,
      leechers: 1,
      magnet: "magnet:?xt=urn:btih:abcdef",
      pub_date: "2024-01-01T00:00:00.000Z",
      remake: false,
      seeders: "many",
      size: "1.3 GiB",
      title: "[SubsPlease] Naruto - 001 (1080p)",
      trusted: true,
      view_url: "https://nyaa.si/view/1",
    }],
    seadex_groups: ["SubsPlease"],
  });

  assertEquals(backgroundJob._tag, "Left");
  assertEquals(searchResults._tag, "Left");

  if (backgroundJob._tag === "Left") {
    assertMatch(backgroundJob.left.message, /cron|interval|manual|disabled/);
  }

  if (searchResults._tag === "Left") {
    assertMatch(searchResults.left.message, /seeders/i);
  }
});

it("shared media schemas accept canonical anime, episode, download, and calendar payloads", () => {
  const anime = Schema.decodeUnknownEither(AnimeSchema)({
    added_at: "2024-01-01T00:00:00.000Z",
    banner_image: "https://example.com/naruto-banner.jpg",
    cover_image: "https://example.com/naruto-cover.jpg",
    description: "A ninja story",
    end_year: 2024,
    episode_count: 12,
    format: "TV",
    genres: ["Action", "Adventure"],
    id: 20,
    mal_id: 1735,
    monitored: true,
    next_airing_episode: {
      airing_at: "2024-01-15T00:00:00.000Z",
      episode: 9,
    },
    profile_name: "Default",
    progress: {
      downloaded: 8,
      downloaded_percent: 67,
      is_up_to_date: false,
      latest_downloaded_episode: 8,
      missing: [9, 10, 11, 12],
      next_missing_episode: 9,
      total: 12,
    },
    release_profile_ids: [1, 2],
    root_folder: "/library/Naruto",
    related_anime: [{
      id: 21,
      relation_type: "SEQUEL",
      season: "spring",
      season_year: 2025,
      start_year: 2025,
      status: "NOT_YET_RELEASED",
      title: {
        english: "Naruto Shippuden",
        romaji: "Naruto Shippuden",
      },
    }],
    recommended_anime: [{
      id: 22,
      rating: 82,
      title: {
        english: "Bleach",
        romaji: "Bleach",
      },
    }],
    score: 82,
    season: "winter",
    season_year: 2024,
    start_date: "2024-01-01",
    start_year: 2024,
    status: "RELEASING",
    studios: ["Pierrot"],
    synonyms: ["Naruto Alt"],
    title: {
      english: "Naruto",
      romaji: "Naruto",
    },
  });
  const episode = Schema.decodeUnknownEither(EpisodeSchema)({
    aired: "2024-01-08T00:00:00.000Z",
    airing_status: "aired",
    audio_channels: "2.0",
    audio_codec: "AAC",
    downloaded: true,
    duration_seconds: 1440,
    file_path: "/library/Naruto/Naruto - 01.mkv",
    file_size: 734003200,
    group: "SubsPlease",
    is_future: false,
    number: 1,
    quality: "WEB-DL",
    resolution: "1080p",
    title: "Enter Naruto Uzumaki",
    video_codec: "HEVC",
  });
  const download = Schema.decodeUnknownEither(DownloadSchema)({
    added_at: "2024-01-01T00:00:00.000Z",
    anime_id: 20,
    anime_image: "https://example.com/naruto.jpg",
    anime_title: "Naruto",
    content_path: "/downloads/Naruto - 01.mkv",
    covered_episodes: [1],
    decision_reason: "Accepted (WEB-DL 1080p, score 12)",
    download_date: "2024-01-01T00:05:00.000Z",
    downloaded_bytes: 500,
    episode_number: 1,
    eta_seconds: 60,
    group_name: "SubsPlease",
    id: 1,
    imported_path: "/library/Naruto/Naruto - 01.mkv",
    is_batch: false,
    last_synced_at: "2024-01-01T00:06:00.000Z",
    progress: 50,
    retry_count: 0,
    save_path: "/downloads",
    speed_bytes: 1024,
    status: "downloading",
    torrent_name: "Naruto - 01",
    total_bytes: 1000,
    source_metadata: {
      chosen_from_seadex: true,
      decision_reason: "Accepted (WEB-DL 1080p, score 12)",
      group: "SubsPlease",
      previous_quality: "WEB-DL 720p",
      previous_score: 7,
      selection_kind: "upgrade",
      selection_score: 12,
    },
  });
  const calendarEvent = Schema.decodeUnknownEither(CalendarEventSchema)({
    all_day: false,
    end: "2024-01-08T00:30:00.000Z",
    extended_props: {
      airing_status: "aired",
      anime_id: 20,
      anime_image: "https://example.com/naruto-cover.jpg",
      anime_title: "Naruto",
      downloaded: true,
      episode_number: 1,
      episode_title: "Enter Naruto Uzumaki",
      is_future: false,
    },
    id: "naruto-1",
    start: "2024-01-08T00:00:00.000Z",
    title: "Naruto - Episode 1",
  });

  assertEquals(anime._tag, "Right");
  assertEquals(episode._tag, "Right");
  assertEquals(download._tag, "Right");
  assertEquals(calendarEvent._tag, "Right");
});

it("shared profile and import schemas accept canonical payloads", () => {
  const qualityProfile = Schema.decodeUnknownEither(QualityProfileSchema)({
    allowed_qualities: ["1080p", "720p"],
    cutoff: "1080p",
    max_size: "4GB",
    min_size: null,
    name: "Default",
    seadex_preferred: true,
    upgrade_allowed: true,
  });
  const releaseProfile = Schema.decodeUnknownEither(ReleaseProfileSchema)({
    enabled: true,
    id: 4,
    is_global: false,
    name: "Preferred Subs",
    rules: [{
      rule_type: "preferred",
      score: 10,
      term: "SubsPlease",
    }],
  });
  const importResult = Schema.decodeUnknownEither(ImportResultSchema)({
    failed: 1,
    failed_files: [{
      error: "Missing episode mapping",
      source_path: "/imports/bad-file.mkv",
    }],
    imported: 2,
    imported_files: [{
      anime_id: 20,
      destination_path: "/library/Naruto/Naruto - 01.mkv",
      episode_number: 1,
      naming_fallback_used: false,
      naming_filename: "Naruto - 01.mkv",
      naming_format_used: "{title} - {episode_segment}",
      naming_metadata_snapshot: {
        title: "Naruto",
        title_source: "preferred_romaji",
      },
      source_path: "/imports/Naruto - 01.mkv",
    }],
  });

  assertEquals(qualityProfile._tag, "Right");
  assertEquals(releaseProfile._tag, "Right");
  assertEquals(importResult._tag, "Right");
});

it("shared media and profile schemas reject invalid nested payloads", () => {
  const anime = Schema.decodeUnknownEither(AnimeSchema)({
    added_at: "2024-01-01T00:00:00.000Z",
    format: "TV",
    id: 20,
    monitored: true,
    profile_name: "Default",
    progress: {
      downloaded: 8,
      missing: ["9"],
    },
    release_profile_ids: [1],
    root_folder: "/library/Naruto",
    status: "RELEASING",
    title: {
      romaji: "Naruto",
    },
  });
  const releaseProfile = Schema.decodeUnknownEither(ReleaseProfileSchema)({
    enabled: true,
    id: 4,
    is_global: false,
    name: "Preferred Subs",
    rules: [{
      rule_type: "preferred-ish",
      score: 10,
      term: "SubsPlease",
    }],
  });
  const importResult = Schema.decodeUnknownEither(ImportResultSchema)({
    failed: 1,
    failed_files: [{
      error: "Missing episode mapping",
      source_path: "/imports/bad-file.mkv",
    }],
    imported: 2,
    imported_files: [{
      anime_id: 20,
      destination_path: "/library/Naruto/Naruto - 01.mkv",
      episode_number: "one",
      source_path: "/imports/Naruto - 01.mkv",
    }],
  });

  assertEquals(anime._tag, "Left");
  assertEquals(releaseProfile._tag, "Left");
  assertEquals(importResult._tag, "Left");

  if (anime._tag === "Left") {
    assertMatch(anime.left.message, /missing/i);
  }

  if (releaseProfile._tag === "Left") {
    assertMatch(releaseProfile.left.message, /preferred|must|must_not/);
  }

  if (importResult._tag === "Left") {
    assertMatch(importResult.left.message, /episode_number/i);
  }
});

it("shared auth and utility schemas accept canonical payloads", () => {
  const health = Schema.decodeUnknownEither(HealthStatusSchema)({
    status: "ok",
  });
  const authUser = Schema.decodeUnknownEither(AuthUserSchema)({
    created_at: "2024-01-01T00:00:00.000Z",
    id: 1,
    must_change_password: false,
    updated_at: "2024-01-01T00:00:00.000Z",
    username: "admin",
  });
  const loginRequest = Schema.decodeUnknownEither(LoginRequestSchema)({
    password: "secret",
    username: "admin",
  });
  const apiKeyLoginRequest = Schema.decodeUnknownEither(
    ApiKeyLoginRequestSchema,
  )({
    api_key: "abc123",
  });
  const loginResponse = Schema.decodeUnknownEither(LoginResponseSchema)({
    api_key: "abc123",
    must_change_password: false,
    username: "admin",
  });
  const changePassword = Schema.decodeUnknownEither(
    ChangePasswordRequestSchema,
  )({
    current_password: "old",
    new_password: "new",
  });
  const apiKeyResponse = Schema.decodeUnknownEither(ApiKeyResponseSchema)({
    api_key: "abc123",
  });
  const videoFile = Schema.decodeUnknownEither(VideoFileSchema)({
    air_date: "2024-01-08",
    audio_channels: "2.0",
    audio_codec: "AAC",
    coverage_summary: "Episode 1",
    duration_seconds: 1440,
    episode_number: 1,
    episode_numbers: [1],
    episode_title: "Enter Naruto Uzumaki",
    group: "SubsPlease",
    name: "Naruto - 01.mkv",
    path: "/library/Naruto/Naruto - 01.mkv",
    quality: "WEB-DL",
    resolution: "1080p",
    size: 1024,
    source_identity: {
      episode_numbers: [1],
      label: "01",
      scheme: "absolute",
    },
    video_codec: "HEVC",
  });
  const libraryRoot = Schema.decodeUnknownEither(LibraryRootSchema)({
    id: 1,
    label: "Anime",
    path: "/library",
  });
  const activityItem = Schema.decodeUnknownEither(ActivityItemSchema)({
    activity_type: "download.completed",
    anime_id: 20,
    anime_title: "Naruto",
    description: "Imported episode 1",
    episode_number: 1,
    id: 2,
    timestamp: "2024-01-01T00:00:00.000Z",
  });

  assertEquals(health._tag, "Right");
  assertEquals(authUser._tag, "Right");
  assertEquals(loginRequest._tag, "Right");
  assertEquals(apiKeyLoginRequest._tag, "Right");
  assertEquals(loginResponse._tag, "Right");
  assertEquals(changePassword._tag, "Right");
  assertEquals(apiKeyResponse._tag, "Right");
  assertEquals(videoFile._tag, "Right");
  assertEquals(libraryRoot._tag, "Right");
  assertEquals(activityItem._tag, "Right");
});

it("shared operational detail schemas accept canonical payloads", () => {
  const quality = Schema.decodeUnknownEither(QualitySchema)({
    id: 1,
    name: "1080p",
    rank: 1,
    resolution: 1080,
    source: "WEB",
  });
  const systemLog = Schema.decodeUnknownEither(SystemLogSchema)({
    created_at: "2024-01-01T00:00:00.000Z",
    details: "Import completed",
    event_type: "import",
    id: 1,
    level: "success",
    message: "Imported file",
  });
  const systemLogsResponse = Schema.decodeUnknownEither(
    SystemLogsResponseSchema,
  )({
    logs: [{
      created_at: "2024-01-01T00:00:00.000Z",
      event_type: "import",
      id: 1,
      level: "success",
      message: "Imported file",
    }],
    total_pages: 3,
  });
  const missingEpisode = Schema.decodeUnknownEither(MissingEpisodeSchema)({
    aired: "2024-01-08T00:00:00.000Z",
    airing_status: "aired",
    anime_id: 20,
    anime_image: "https://example.com/naruto.jpg",
    anime_title: "Naruto",
    episode_number: 2,
    episode_title: "My Name is Konohamaru",
    is_future: false,
    next_airing_episode: {
      airing_at: "2024-01-15T12:00:00.000Z",
      episode: 3,
    },
  });
  const renamePreview = Schema.decodeUnknownEither(RenamePreviewItemSchema)({
    current_path: "/library/Naruto/ep1.mkv",
    episode_number: 1,
    fallback_used: true,
    format_used: "{title} - {episode_segment}",
    metadata_snapshot: {
      audio_channels: "2.0",
      audio_codec: "AAC",
      episode_title: "Enter Naruto Uzumaki!",
      quality: "WEB-DL",
      resolution: "1080p",
      source_identity: {
        episode_numbers: [1],
        label: "S01E01",
        scheme: "season",
        season: 1,
      },
      title: "Naruto",
      title_source: "preferred_romaji",
      video_codec: "HEVC",
      year: 2024,
    },
    missing_fields: ["season"],
    new_filename: "Naruto - 01.mkv",
    new_path: "/library/Naruto/Naruto - 01.mkv",
    warnings: ["Used safe fallback naming format instead of configured format"],
  });
  const renameResult = Schema.decodeUnknownEither(RenameResultSchema)({
    failed: 1,
    failures: ["Missing episode number"],
    renamed: 4,
  });
  const scannedFile = Schema.decodeUnknownEither(ScannedFileSchema)({
    air_date: "2024-01-01",
    audio_channels: "2.0",
    audio_codec: "AAC",
    coverage_summary: "Episodes 1-2",
    duration_seconds: 1440,
    episode_conflict: {
      anime_id: 20,
      anime_title: "Naruto",
      episode_numbers: [1, 2],
      file_path: "/library/Naruto/Naruto - 01.mkv",
    },
    episode_number: 1,
    episode_numbers: [1, 2],
    episode_title: "Premiere",
    existing_mapping: {
      anime_id: 20,
      anime_title: "Naruto",
      episode_numbers: [1, 2],
      file_path: "/imports/Naruto - 01.mkv",
    },
    filename: "Naruto - 01.mkv",
    group: "SubsPlease",
    match_confidence: 0.92,
    matched_anime: {
      id: 20,
      title: "Naruto",
    },
    match_reason: "Matched existing library title from the parsed filename",
    naming_fallback_used: false,
    naming_filename: "Naruto - 01.mkv",
    naming_format_used: "{title} - {episode_segment}",
    naming_metadata_snapshot: {
      title: "Naruto",
      title_source: "preferred_romaji",
    },
    parsed_title: "Naruto",
    quality: "WEB-DL",
    resolution: "1080p",
    season: 1,
    size: 734003200,
    source_path: "/imports/Naruto - 01.mkv",
    suggested_candidate_id: 20,
    video_codec: "HEVC",
    warnings: [
      "Skipped {episode_title} because the file covers multiple episodes",
    ],
  });
  const skippedFile = Schema.decodeUnknownEither(SkippedFileSchema)({
    path: "/imports/readme.txt",
    reason: "Unsupported file type",
  });
  const unmappedFolder = Schema.decodeUnknownEither(UnmappedFolderSchema)({
    match_status: "done",
    name: "Scissor.Seven.S04.1080p.NF.WEB-DL.AAC2.0.H.264-VARYG",
    path: "/library/Scissor.Seven.S04.1080p.NF.WEB-DL.AAC2.0.H.264-VARYG",
    search_queries: ["Scissor Seven Season 4", "Scissor Seven"],
    size: 0,
    suggested_matches: [{
      id: 20,
      title: { romaji: "Scissor Seven" },
    }],
  });
  const scanResult = Schema.decodeUnknownEither(ScanResultSchema)({
    candidates: [{
      id: 20,
      title: {
        romaji: "Naruto",
      },
    }],
    files: [{
      episode_number: 1,
      episode_numbers: [1, 2],
      filename: "Naruto - 01.mkv",
      parsed_title: "Naruto",
      source_path: "/imports/Naruto - 01.mkv",
    }],
    skipped: [{
      path: "/imports/readme.txt",
      reason: "Unsupported file type",
    }],
  });
  const downloadAction = Schema.decodeUnknownEither(DownloadActionSchema)({
    Accept: {
      is_seadex: true,
      quality: {
        id: 1,
        name: "1080p",
        rank: 1,
        resolution: 1080,
        source: "WEB",
      },
      score: 100,
    },
  });
  const episodeSearchResult = Schema.decodeUnknownEither(
    EpisodeSearchResultSchema,
  )({
    download_action: {
      Reject: {
        reason: "Too many duplicates",
      },
    },
    group: "SubsPlease",
    indexer: "nyaa",
    info_hash: "abcdefabcdefabcdefabcdefabcdefabcdefabcd",
    parsed_air_date: "2024-01-01",
    parsed_episode_label: "01",
    parsed_episode_numbers: [1],
    parsed_resolution: "1080p",
    leechers: 1,
    link: "magnet:?xt=urn:btih:abcdef",
    publish_date: "2024-01-01T00:00:00.000Z",
    quality: "1080p",
    remake: false,
    seadex_comparison: "https://releases.moe/compare/example",
    seadex_dual_audio: true,
    seadex_notes: "Preferred release",
    seadex_release_group: "SubsPlease",
    seadex_tags: ["Best"],
    seeders: 55,
    size: 1024,
    title: "Naruto - 01",
    trusted: true,
    view_url: "https://nyaa.si/view/1",
  });
  const notificationEvent = Schema.decodeUnknownEither(NotificationEventSchema)(
    {
      payload: {
        downloads: [{
          anime_id: 20,
          anime_title: "Naruto",
          downloaded_bytes: 512,
          episode_number: 1,
          eta: 60,
          hash: "abcdef",
          id: 1,
          name: "Naruto - 01",
          progress: 0.5,
          speed: 1024,
          state: "downloading",
          total_bytes: 1024,
        }],
      },
      type: "DownloadProgress",
    },
  );
  const downloadFinishedEvent = Schema.decodeUnknownEither(
    NotificationEventSchema,
  )({
    payload: {
      anime_id: 20,
      imported_path: "/library/Naruto/Naruto - 01.mkv",
      source_metadata: {
        group: "SubsPlease",
        indexer: "Nyaa",
        quality: "WEB-DL 1080p",
      },
      title: "[SubsPlease] Naruto - 01 (1080p)",
    },
    type: "DownloadFinished",
  });
  const config = Schema.decodeUnknownEither(ConfigSchema)({
    downloads: {
      create_anime_folders: true,
      delete_download_files_after_import: true,
      max_size_gb: 4,
      prefer_dual_audio: false,
      preferred_codec: null,
      preferred_groups: ["SubsPlease"],
      reconcile_completed_downloads: true,
      remote_path_mappings: [["/remote", "/local"]],
      remove_torrent_on_import: false,
      root_path: "/downloads",
      use_seadex: true,
    },
    general: {
      database_path: "./bakarr.sqlite",
      images_path: "./data/images",
      log_level: "info",
      max_db_connections: 5,
      min_db_connections: 1,
      suppress_connection_errors: false,
      worker_threads: 4,
    },
    library: {
      auto_scan_interval_hours: 6,
      airing_day_start_hour: 4,
      airing_timezone: "Asia/Tokyo",
      import_mode: "copy",
      library_path: "./library",
      movie_naming_format: "{title}",
      naming_format: "{series_title} - {episode:00}",
      preferred_title: "english",
      recycle_cleanup_days: 30,
      recycle_path: "./recycle",
    },
    nyaa: {
      base_url: "https://nyaa.si",
      default_category: "1_2",
      filter_remakes: true,
      min_seeders: 5,
      preferred_resolution: null,
    },
    profiles: [{
      allowed_qualities: ["1080p"],
      cutoff: "1080p",
      max_size: null,
      min_size: null,
      name: "Default",
      seadex_preferred: false,
      upgrade_allowed: true,
    }],
    qbittorrent: {
      default_category: "anime",
      enabled: true,
      password: null,
      url: "http://localhost:8080",
      username: "admin",
    },
    scheduler: {
      check_delay_seconds: 5,
      check_interval_minutes: 30,
      cron_expression: null,
      enabled: true,
      max_concurrent_checks: 2,
      metadata_refresh_hours: 24,
    },
  });

  assertEquals(quality._tag, "Right");
  assertEquals(systemLog._tag, "Right");
  assertEquals(systemLogsResponse._tag, "Right");
  assertEquals(missingEpisode._tag, "Right");
  assertEquals(renamePreview._tag, "Right");
  assertEquals(renameResult._tag, "Right");
  assertEquals(scannedFile._tag, "Right");
  assertEquals(skippedFile._tag, "Right");
  assertEquals(unmappedFolder._tag, "Right");
  assertEquals(scanResult._tag, "Right");
  assertEquals(downloadAction._tag, "Right");
  assertEquals(episodeSearchResult._tag, "Right");
  assertEquals(notificationEvent._tag, "Right");
  assertEquals(downloadFinishedEvent._tag, "Right");
  assertEquals(config._tag, "Right");
});

it("shared config and notification schemas reject invalid payloads", () => {
  const notificationEvent = Schema.decodeUnknownEither(NotificationEventSchema)(
    {
      payload: {
        current: "1",
        total: 4,
      },
      type: "ScanProgress",
    },
  );
  const config = Schema.decodeUnknownEither(ConfigSchema)({
    downloads: {
      create_anime_folders: true,
      max_size_gb: 4,
      prefer_dual_audio: false,
      preferred_groups: ["SubsPlease"],
      remote_path_mappings: [["/remote"]],
      root_path: "/downloads",
      use_seadex: true,
    },
    general: {
      database_path: "./bakarr.sqlite",
      images_path: "./data/images",
      log_level: "info",
      max_db_connections: 5,
      min_db_connections: 1,
      suppress_connection_errors: false,
      worker_threads: 4,
    },
    library: {
      auto_scan_interval_hours: 6,
      import_mode: "symlink",
      library_path: "./library",
      movie_naming_format: "{title}",
      naming_format: "{series_title} - {episode:00}",
      preferred_title: "english",
      recycle_cleanup_days: 30,
      recycle_path: "./recycle",
    },
    nyaa: {
      base_url: "https://nyaa.si",
      default_category: "1_2",
      filter_remakes: true,
      min_seeders: 5,
    },
    profiles: [],
    qbittorrent: {
      default_category: "anime",
      enabled: true,
      url: "http://localhost:8080",
      username: "admin",
    },
    scheduler: {
      check_delay_seconds: 5,
      check_interval_minutes: 30,
      enabled: true,
      max_concurrent_checks: 2,
      metadata_refresh_hours: 24,
    },
  });

  assertEquals(notificationEvent._tag, "Left");
  assertEquals(config._tag, "Left");

  if (notificationEvent._tag === "Left") {
    assertMatch(notificationEvent.left.message, /current/i);
  }

  if (config._tag === "Left") {
    assertMatch(config.left.message, /copy|move|items count/i);
  }
});
