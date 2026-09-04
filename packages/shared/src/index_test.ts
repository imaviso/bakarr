import { assertEquals, assertMatch, it } from "./test/vitest.ts";
import { Effect, Schema } from "effect";

import {
  ActivityItemSchema,
  MediaSchema,
  MediaSearchResultSchema,
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
  MediaUnitSchema,
  UnitSearchResultSchema,
  HealthStatusSchema,
  ImportModeSchema,
  ImportResultSchema,
  LibraryRootSchema,
  LibraryStatsSchema,
  LoginRequestSchema,
  LoginResponseSchema,
  MissingUnitSchema,
  NotificationEventSchema,
  resolveSeasonFromDate,
  resolveSeasonWindowFromDate,
  resolveSeasonYearFromDate,
  SeasonalMediaQueryParamsSchema,
  SeasonalMediaResponseSchema,
  decodeNotificationEventWire,
  encodeNotificationEventWire,
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
} from "./index.ts";

it("shared config schemas accept canonical literal values", () => {
  const importMode = Schema.decodeUnknownResult(ImportModeSchema)("copy");
  const preferredTitle = Schema.decodeUnknownResult(PreferredTitleSchema)("english");
  const ruleType = Schema.decodeUnknownResult(RuleTypeSchema)("must_not");

  assertEquals(importMode._tag, "Success");
  assertEquals(preferredTitle._tag, "Success");
  assertEquals(ruleType._tag, "Success");
});

it("shared config schemas reject unsupported literals", () => {
  const importMode = Schema.decodeUnknownResult(ImportModeSchema)("link");
  const preferredTitle = Schema.decodeUnknownResult(PreferredTitleSchema)("kana");

  assertEquals(importMode._tag, "Failure");
  assertEquals(preferredTitle._tag, "Failure");

  if (importMode._tag === "Failure") {
    assertMatch(importMode.failure.message, /copy|move/);
  }

  if (preferredTitle._tag === "Failure") {
    assertMatch(preferredTitle.failure.message, /romaji|english|native/);
  }
});

it("shared api schemas accept canonical system and download payloads", () => {
  const downloadEvent = Schema.decodeUnknownResult(DownloadEventSchema)({
    media_id: 20,
    media_image: "https://example.com/naruto.jpg",
    media_title: "Naruto",
    created_at: "2024-01-01T00:00:00.000Z",
    download_id: 4,
    event_type: "download.started",
    from_status: "queued",
    id: 8,
    message: "Started Naruto - 01",
    metadata: '{"source":"rss"}',
    metadata_json: {
      covered_units: [1],
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
  const downloadEventsPage = Schema.decodeUnknownResult(DownloadEventsPageSchema)({
    events: [
      {
        media_id: 20,
        created_at: "2024-01-01T00:00:00.000Z",
        event_type: "download.queued",
        id: 8,
        message: "Queued Naruto - 01",
      },
    ],
    has_more: true,
    limit: 25,
    next_cursor: "7",
    prev_cursor: "9",
    total: 80,
  });
  const downloadEventsExport = Schema.decodeUnknownResult(DownloadEventsExportSchema)({
    events: [
      {
        media_id: 20,
        created_at: "2024-01-01T00:00:00.000Z",
        event_type: "download.queued",
        id: 8,
        message: "Queued Naruto - 01",
      },
    ],
    exported: 1,
    generated_at: "2024-01-01T00:01:00.000Z",
    limit: 1000,
    order: "desc",
    total: 80,
    truncated: false,
  });
  const downloadStatus = Schema.decodeUnknownResult(DownloadStatusSchema)({
    media_id: 20,
    media_image: "https://example.com/naruto.jpg",
    media_title: "Naruto",
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
  const systemStatus = Schema.decodeUnknownResult(SystemStatusSchema)({
    active_torrents: 1,
    disk_space: {
      free: 512,
      total: 1024,
    },
    last_rss: null,
    last_scan: "2024-01-01T00:00:00.000Z",
    metadata_providers: {
      anidb: {
        configured: false,
        enabled: false,
      },
      jikan: {
        configured: true,
        enabled: true,
      },
      manami: {
        configured: true,
        enabled: true,
      },
    },
    pending_downloads: 2,
    uptime: 42,
    version: "0.1.0",
  });

  assertEquals(downloadEvent._tag, "Success");
  assertEquals(downloadEventsPage._tag, "Success");
  assertEquals(downloadEventsExport._tag, "Success");
  assertEquals(downloadStatus._tag, "Success");
  assertEquals(systemStatus._tag, "Success");
});

it("shared api schemas reject invalid download payloads", () => {
  const downloadStatus = Schema.decodeUnknownResult(DownloadStatusSchema)({
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

  assertEquals(downloadStatus._tag, "Failure");

  if (downloadStatus._tag === "Failure") {
    assertMatch(downloadStatus.failure.message, /progress/i);
  }
});

it("shared dashboard and browse schemas accept canonical payloads", () => {
  const rssFeed = Schema.decodeUnknownResult(RssFeedSchema)({
    media_id: 20,
    created_at: "2024-01-01T00:00:00.000Z",
    enabled: true,
    id: 1,
    last_checked: "2024-01-02T00:00:00.000Z",
    name: "Main feed",
    url: "https://example.com/feed.xml",
  });
  const libraryStats = Schema.decodeUnknownResult(LibraryStatsSchema)({
    downloaded_units: 8,
    downloaded_percent: 67,
    missing_units: 4,
    monitored_media: 3,
    recent_downloads: 2,
    rss_feeds: 3,
    total_media: 5,
    total_units: 12,
    up_to_date_media: 2,
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
  const dashboard = Schema.decodeUnknownResult(OpsDashboardSchema)({
    active_downloads: 1,
    failed_downloads: 0,
    imported_downloads: 3,
    jobs: [backgroundJob],
    queued_downloads: 2,
    recent_download_events: [
      {
        media_id: 20,
        created_at: "2024-01-01T00:00:00.000Z",
        download_id: 4,
        event_type: "download.started",
        from_status: "queued",
        id: 8,
        message: "Started Naruto - 01",
        metadata: '{"source":"rss"}',
        to_status: "downloading",
      },
    ],
    running_jobs: 1,
  });
  const browse = Schema.decodeUnknownResult(BrowseResultSchema)({
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
  const backgroundJobStatus = Schema.decodeUnknownResult(BackgroundJobStatusSchema)(backgroundJob);

  assertEquals(rssFeed._tag, "Success");
  assertEquals(libraryStats._tag, "Success");
  assertEquals(backgroundJobStatus._tag, "Success");
  assertEquals(dashboard._tag, "Success");
  assertEquals(browse._tag, "Success");
});

it("shared search and scanner schemas accept canonical payloads", () => {
  const animeSearchResult = {
    already_in_library: true,
    banner_image: "https://example.com/naruto-banner.jpg",
    cover_image: "https://example.com/naruto.jpg",
    description: "A ninja story",
    duration: "24 min",
    end_year: 2024,
    unit_count: 12,
    favorites: 1000,
    format: "TV",
    genres: ["Action", "Adventure"],
    id: 20,
    members: 250000,
    match_confidence: 0.94,
    match_reason: "Matched AniList search for the normalized folder title",
    recommended_media: [
      {
        id: 22,
        rating: 82,
        title: {
          english: "Bleach",
          romaji: "Bleach",
        },
      },
    ],
    related_media: [
      {
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
      },
    ],
    season: "winter",
    season_year: 2024,
    start_date: "2024-01-07",
    start_year: 2024,
    status: "RELEASING",
    source: "MANGA",
    synonyms: ["Naruto Alt"],
    title: {
      english: "Naruto",
      romaji: "Naruto",
    },
  };
  const media = Schema.decodeUnknownResult(MediaSearchResultSchema)(animeSearchResult);
  const searchResults = Schema.decodeUnknownResult(SearchResultsSchema)({
    results: [
      {
        info_hash: "abcdefabcdefabcdefabcdefabcdefabcdefabcd",
        indexer: "Nyaa",
        is_seadex: false,
        is_seadex_best: false,
        leechers: 1,
        magnet: "magnet:?xt=urn:btih:abcdef",
        parsed_unit: "1",
        parsed_unit_numbers: [1, 2, 3],
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
      },
    ],
    seadex_groups: ["SubsPlease"],
  });
  const scannerState = Schema.decodeUnknownResult(ScannerStateSchema)({
    folders: [
      {
        match_attempts: 1,
        last_matched_at: "2024-01-01T00:00:00.000Z",
        match_status: "done",
        name: "Naruto",
        path: "/imports/Naruto",
        size: 1024,
        suggested_matches: [animeSearchResult],
      },
    ],
    has_outstanding_matches: true,
    is_scanning: true,
    last_updated: "2024-01-01T00:00:00.000Z",
    match_counts: {
      exact: 1,
      failed: 0,
      matched: 1,
      matching: 0,
      paused: 0,
      queued: 0,
    },
    match_status: "running",
  });

  assertEquals(media._tag, "Success");
  assertEquals(searchResults._tag, "Success");
  assertEquals(scannerState._tag, "Success");
});

it("shared nested dto schemas reject invalid payloads", () => {
  const backgroundJob = Schema.decodeUnknownResult(BackgroundJobStatusSchema)({
    is_running: false,
    name: "rss",
    progress_current: 1,
    progress_total: 5,
    run_count: 7,
    schedule_mode: "weekly",
  });
  const searchResults = Schema.decodeUnknownResult(SearchResultsSchema)({
    results: [
      {
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
      },
    ],
    seadex_groups: ["SubsPlease"],
  });

  assertEquals(backgroundJob._tag, "Failure");
  assertEquals(searchResults._tag, "Failure");

  if (backgroundJob._tag === "Failure") {
    assertMatch(backgroundJob.failure.message, /cron|interval|manual|disabled/);
  }

  if (searchResults._tag === "Failure") {
    assertMatch(searchResults.failure.message, /seeders/i);
  }
});

it("shared media schemas accept canonical anime, episode, download, and calendar payloads", () => {
  const media = Schema.decodeUnknownResult(MediaSchema)({
    added_at: "2024-01-01T00:00:00.000Z",
    background: "World reset event",
    banner_image: "https://example.com/naruto-banner.jpg",
    cover_image: "https://example.com/naruto-cover.jpg",
    description: "A ninja story",
    duration: "24 min",
    end_year: 2024,
    unit_count: 12,
    favorites: 22000,
    format: "TV",
    genres: ["Action", "Adventure"],
    id: 20,
    mal_id: 1735,
    media_kind: "anime",
    members: 500000,
    monitored: true,
    next_airing_unit: {
      airing_at: "2024-01-15T00:00:00.000Z",
      unit_number: 9,
    },
    profile_name: "Default",
    progress: {
      downloaded: 8,
      downloaded_percent: 67,
      is_up_to_date: false,
      latest_downloaded_unit: 8,
      missing: [9, 10, 11, 12],
      next_missing_unit: 9,
      total: 12,
    },
    release_profile_ids: [1, 2],
    root_folder: "/library/Naruto",
    popularity: 14,
    rank: 8,
    rating: "PG-13 - Teens 13 or older",
    related_media: [
      {
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
      },
    ],
    recommended_media: [
      {
        id: 22,
        rating: 82,
        title: {
          english: "Bleach",
          romaji: "Bleach",
        },
      },
    ],
    score: 82,
    season: "winter",
    season_year: 2024,
    start_date: "2024-01-01",
    start_year: 2024,
    status: "RELEASING",
    studios: ["Pierrot"],
    source: "MANGA",
    synonyms: ["Naruto Alt"],
    title: {
      english: "Naruto",
      romaji: "Naruto",
    },
  });
  const episode = Schema.decodeUnknownResult(MediaUnitSchema)({
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
  const download = Schema.decodeUnknownResult(DownloadSchema)({
    added_at: "2024-01-01T00:00:00.000Z",
    media_id: 20,
    media_image: "https://example.com/naruto.jpg",
    media_title: "Naruto",
    content_path: "/downloads/Naruto - 01.mkv",
    covered_units: [1],
    decision_reason: "Accepted (WEB-DL 1080p, score 12)",
    download_date: "2024-01-01T00:05:00.000Z",
    downloaded_bytes: 500,
    unit_number: 1,
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
  const calendarEvent = Schema.decodeUnknownResult(CalendarEventSchema)({
    all_day: false,
    end: "2024-01-08T00:30:00.000Z",
    extended_props: {
      airing_status: "aired",
      media_id: 20,
      media_image: "https://example.com/naruto-cover.jpg",
      media_title: "Naruto",
      downloaded: true,
      unit_number: 1,
      unit_title: "Enter Naruto Uzumaki",
      is_future: false,
    },
    id: "naruto-1",
    start: "2024-01-08T00:00:00.000Z",
    title: "Naruto - MediaUnit 1",
  });

  assertEquals(media._tag, "Success");
  assertEquals(episode._tag, "Success");
  assertEquals(download._tag, "Success");
  assertEquals(calendarEvent._tag, "Success");
});

it("shared profile and import schemas accept canonical payloads", () => {
  const qualityProfile = Schema.decodeUnknownResult(QualityProfileSchema)({
    allowed_qualities: ["1080p", "720p"],
    cutoff: "1080p",
    max_size: "4GB",
    min_size: null,
    name: "Default",
    seadex_preferred: true,
    upgrade_allowed: true,
  });
  const releaseProfile = Schema.decodeUnknownResult(ReleaseProfileSchema)({
    enabled: true,
    id: 4,
    is_global: false,
    name: "Preferred Subs",
    rules: [
      {
        rule_type: "preferred",
        score: 10,
        term: "SubsPlease",
      },
    ],
  });
  const importResult = Schema.decodeUnknownResult(ImportResultSchema)({
    failed: 1,
    failed_files: [
      {
        error: "Missing episode mapping",
        source_path: "/imports/bad-file.mkv",
      },
    ],
    imported: 2,
    imported_files: [
      {
        media_id: 20,
        destination_path: "/library/Naruto/Naruto - 01.mkv",
        unit_number: 1,
        naming_fallback_used: false,
        naming_filename: "Naruto - 01.mkv",
        naming_format_used: "{title} - {episode_segment}",
        naming_metadata_snapshot: {
          title: "Naruto",
          title_source: "preferred_romaji",
        },
        source_path: "/imports/Naruto - 01.mkv",
      },
    ],
  });

  assertEquals(qualityProfile._tag, "Success");
  assertEquals(releaseProfile._tag, "Success");
  assertEquals(importResult._tag, "Success");
});

it("shared media and profile schemas reject invalid nested payloads", () => {
  const media = Schema.decodeUnknownResult(MediaSchema)({
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
  const releaseProfile = Schema.decodeUnknownResult(ReleaseProfileSchema)({
    enabled: true,
    id: 4,
    is_global: false,
    name: "Preferred Subs",
    rules: [
      {
        rule_type: "preferred-ish",
        score: 10,
        term: "SubsPlease",
      },
    ],
  });
  const importResult = Schema.decodeUnknownResult(ImportResultSchema)({
    failed: 1,
    failed_files: [
      {
        error: "Missing episode mapping",
        source_path: "/imports/bad-file.mkv",
      },
    ],
    imported: 2,
    imported_files: [
      {
        media_id: 20,
        destination_path: "/library/Naruto/Naruto - 01.mkv",
        unit_number: "one",
        source_path: "/imports/Naruto - 01.mkv",
      },
    ],
  });

  assertEquals(media._tag, "Failure");
  assertEquals(releaseProfile._tag, "Failure");
  assertEquals(importResult._tag, "Failure");

  if (media._tag === "Failure") {
    assertMatch(media.failure.message, /missing/i);
  }

  if (releaseProfile._tag === "Failure") {
    assertMatch(releaseProfile.failure.message, /preferred|must|must_not/);
  }

  if (importResult._tag === "Failure") {
    assertMatch(importResult.failure.message, /unit_number/i);
  }
});

it("shared auth and utility schemas accept canonical payloads", () => {
  const health = Schema.decodeUnknownResult(HealthStatusSchema)({
    status: "ok",
  });
  const authUser = Schema.decodeUnknownResult(AuthUserSchema)({
    created_at: "2024-01-01T00:00:00.000Z",
    id: 1,
    must_change_password: false,
    updated_at: "2024-01-01T00:00:00.000Z",
    username: "admin",
  });
  const loginRequest = Schema.decodeUnknownResult(LoginRequestSchema)({
    password: "secret",
    username: "admin",
  });
  const apiKeyLoginRequest = Schema.decodeUnknownResult(ApiKeyLoginRequestSchema)({
    api_key: "abc123",
  });
  const loginResponse = Schema.decodeUnknownResult(LoginResponseSchema)({
    api_key: "abc123",
    api_key_masked: false,
    must_change_password: false,
    username: "admin",
  });
  const changePassword = Schema.decodeUnknownResult(ChangePasswordRequestSchema)({
    current_password: "old",
    new_password: "new",
  });
  const apiKeyResponse = Schema.decodeUnknownResult(ApiKeyResponseSchema)({
    api_key: "abc123",
    api_key_masked: false,
  });
  const videoFile = Schema.decodeUnknownResult(VideoFileSchema)({
    air_date: "2024-01-08",
    audio_channels: "2.0",
    audio_codec: "AAC",
    coverage_summary: "MediaUnit 1",
    duration_seconds: 1440,
    unit_number: 1,
    unit_numbers: [1],
    unit_title: "Enter Naruto Uzumaki",
    group: "SubsPlease",
    name: "Naruto - 01.mkv",
    path: "/library/Naruto/Naruto - 01.mkv",
    quality: "WEB-DL",
    resolution: "1080p",
    size: 1024,
    source_identity: {
      unit_numbers: [1],
      label: "01",
      scheme: "absolute",
    },
    video_codec: "HEVC",
  });
  const libraryRoot = Schema.decodeUnknownResult(LibraryRootSchema)({
    id: 1,
    label: "Media",
    path: "/library",
  });
  const activityItem = Schema.decodeUnknownResult(ActivityItemSchema)({
    activity_type: "download.completed",
    media_id: 20,
    media_title: "Naruto",
    description: "Imported episode 1",
    unit_number: 1,
    id: 2,
    timestamp: "2024-01-01T00:00:00.000Z",
  });

  assertEquals(health._tag, "Success");
  assertEquals(authUser._tag, "Success");
  assertEquals(loginRequest._tag, "Success");
  assertEquals(apiKeyLoginRequest._tag, "Success");
  assertEquals(loginResponse._tag, "Success");
  assertEquals(changePassword._tag, "Success");
  assertEquals(apiKeyResponse._tag, "Success");
  assertEquals(videoFile._tag, "Success");
  assertEquals(libraryRoot._tag, "Success");
  assertEquals(activityItem._tag, "Success");
});

it("shared operational detail schemas accept canonical payloads", () => {
  const quality = Schema.decodeUnknownResult(QualitySchema)({
    id: 1,
    name: "1080p",
    rank: 1,
    resolution: 1080,
    source: "WEB",
  });
  const systemLog = Schema.decodeUnknownResult(SystemLogSchema)({
    created_at: "2024-01-01T00:00:00.000Z",
    details: "Import completed",
    event_type: "import",
    id: 1,
    level: "success",
    message: "Imported file",
  });
  const systemLogsResponse = Schema.decodeUnknownResult(SystemLogsResponseSchema)({
    logs: [
      {
        created_at: "2024-01-01T00:00:00.000Z",
        event_type: "import",
        id: 1,
        level: "success",
        message: "Imported file",
      },
    ],
    total_pages: 3,
  });
  const missingEpisode = Schema.decodeUnknownResult(MissingUnitSchema)({
    aired: "2024-01-08T00:00:00.000Z",
    airing_status: "aired",
    media_id: 20,
    media_image: "https://example.com/naruto.jpg",
    media_title: "Naruto",
    unit_number: 2,
    unit_title: "My Name is Konohamaru",
    is_future: false,
    next_airing_unit: {
      airing_at: "2024-01-15T12:00:00.000Z",
      unit_number: 3,
    },
  });
  const renamePreview = Schema.decodeUnknownResult(RenamePreviewItemSchema)({
    current_path: "/library/Naruto/ep1.mkv",
    unit_number: 1,
    fallback_used: true,
    format_used: "{title} - {episode_segment}",
    metadata_snapshot: {
      audio_channels: "2.0",
      audio_codec: "AAC",
      unit_title: "Enter Naruto Uzumaki!",
      quality: "WEB-DL",
      resolution: "1080p",
      source_identity: {
        unit_numbers: [1],
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
  const renameResult = Schema.decodeUnknownResult(RenameResultSchema)({
    failed: 1,
    failures: ["Missing episode number"],
    renamed: 4,
  });
  const scannedFile = Schema.decodeUnknownResult(ScannedFileSchema)({
    air_date: "2024-01-01",
    audio_channels: "2.0",
    audio_codec: "AAC",
    coverage_summary: "Episodes 1-2",
    duration_seconds: 1440,
    unit_conflict: {
      media_id: 20,
      media_title: "Naruto",
      unit_numbers: [1, 2],
      file_path: "/library/Naruto/Naruto - 01.mkv",
    },
    unit_number: 1,
    unit_numbers: [1, 2],
    unit_title: "Premiere",
    existing_mapping: {
      media_id: 20,
      media_title: "Naruto",
      unit_numbers: [1, 2],
      file_path: "/imports/Naruto - 01.mkv",
    },
    filename: "Naruto - 01.mkv",
    group: "SubsPlease",
    match_confidence: 0.92,
    matched_media: {
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
    warnings: ["Skipped {unit_title} because the file covers multiple episodes"],
  });
  const skippedFile = Schema.decodeUnknownResult(SkippedFileSchema)({
    path: "/imports/readme.txt",
    reason: "Unsupported file type",
  });
  const unmappedFolder = Schema.decodeUnknownResult(UnmappedFolderSchema)({
    match_status: "done",
    name: "Scissor.Seven.S04.1080p.NF.WEB-DL.AAC2.0.H.264-VARYG",
    path: "/library/Scissor.Seven.S04.1080p.NF.WEB-DL.AAC2.0.H.264-VARYG",
    search_queries: ["Scissor Seven Season 4", "Scissor Seven"],
    size: 0,
    suggested_matches: [
      {
        id: 20,
        title: { romaji: "Scissor Seven" },
      },
    ],
  });
  const scanResult = Schema.decodeUnknownResult(ScanResultSchema)({
    candidates: [
      {
        id: 20,
        title: {
          romaji: "Naruto",
        },
      },
    ],
    files: [
      {
        unit_number: 1,
        unit_numbers: [1, 2],
        filename: "Naruto - 01.mkv",
        parsed_title: "Naruto",
        source_path: "/imports/Naruto - 01.mkv",
      },
    ],
    skipped: [
      {
        path: "/imports/readme.txt",
        reason: "Unsupported file type",
      },
    ],
  });
  const downloadAction = Schema.decodeUnknownResult(DownloadActionSchema)({
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
  const episodeSearchResult = Schema.decodeUnknownResult(UnitSearchResultSchema)({
    download_action: {
      Reject: {
        reason: "Too many duplicates",
      },
    },
    group: "SubsPlease",
    indexer: "nyaa",
    info_hash: "abcdefabcdefabcdefabcdefabcdefabcdefabcd",
    parsed_air_date: "2024-01-01",
    parsed_unit_label: "01",
    parsed_unit_numbers: [1],
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
  const notificationEvent = Schema.decodeUnknownResult(NotificationEventSchema)({
    payload: {
      downloads: [
        {
          media_id: 20,
          media_title: "Naruto",
          downloaded_bytes: 512,
          unit_number: 1,
          eta: 60,
          hash: "abcdef",
          id: 1,
          name: "Naruto - 01",
          progress: 0.5,
          speed: 1024,
          state: "downloading",
          total_bytes: 1024,
        },
      ],
    },
    type: "DownloadProgress",
  });
  const downloadFinishedEvent = Schema.decodeUnknownResult(NotificationEventSchema)({
    payload: {
      media_id: 20,
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
  const config = Schema.decodeUnknownResult(ConfigSchema)({
    downloads: {
      create_media_folders: true,
      delete_download_files_after_import: true,
      reconcile_completed_downloads: true,
      remote_path_mappings: [["/remote", "/local"]],
      remove_torrent_on_import: false,
      root_path: "/downloads",
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
      anime_path: "./library/anime",
      manga_path: "./library/manga",
      light_novel_path: "./library/light-novels",
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
    profiles: [
      {
        allowed_qualities: ["1080p"],
        cutoff: "1080p",
        max_size: null,
        min_size: null,
        name: "Default",
        seadex_preferred: false,
        upgrade_allowed: true,
      },
    ],
    qbittorrent: {
      default_category: "anime",
      enabled: true,
      password: null,
      ratio_limit: 1.5,
      save_path: "/downloads/anime",
      url: "http://localhost:8080",
      username: "admin",
    },
    rtorrent: {
      enabled: false,
      save_path: null,
      trusted_local: true,
      url: "scgi://localhost:5000",
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

  assertEquals(quality._tag, "Success");
  assertEquals(systemLog._tag, "Success");
  assertEquals(systemLogsResponse._tag, "Success");
  assertEquals(missingEpisode._tag, "Success");
  assertEquals(renamePreview._tag, "Success");
  assertEquals(renameResult._tag, "Success");
  assertEquals(scannedFile._tag, "Success");
  assertEquals(skippedFile._tag, "Success");
  assertEquals(unmappedFolder._tag, "Success");
  assertEquals(scanResult._tag, "Success");
  assertEquals(downloadAction._tag, "Success");
  assertEquals(episodeSearchResult._tag, "Success");
  assertEquals(notificationEvent._tag, "Success");
  assertEquals(downloadFinishedEvent._tag, "Success");
  assertEquals(config._tag, "Success");
});

it("shared config and notification schemas reject invalid payloads", () => {
  const notificationEvent = Schema.decodeUnknownResult(NotificationEventSchema)({
    payload: {
      current: "1",
      total: 4,
    },
    type: "ScanProgress",
  });
  const config = Schema.decodeUnknownResult(ConfigSchema)({
    downloads: {
      create_media_folders: true,
      remote_path_mappings: [["/remote"]],
      root_path: "/downloads",
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
      anime_path: "./library/anime",
      manga_path: "./library/manga",
      light_novel_path: "./library/light-novels",
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
    rtorrent: {
      enabled: false,
      save_path: null,
      trusted_local: true,
      url: "scgi://localhost:5000",
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

  assertEquals(notificationEvent._tag, "Failure");
  assertEquals(config._tag, "Failure");

  if (notificationEvent._tag === "Failure") {
    assertMatch(notificationEvent.failure.message, /current/i);
  }

  if (config._tag === "Failure") {
    assertMatch(config.failure.message, /copy|move|items count/i);
  }
});

it("notification wire codec round-trips canonical payloads", () => {
  const encoded = Effect.runSync(
    encodeNotificationEventWire({
      payload: {
        title: "[SubsPlease] Naruto - 01 (1080p)",
      },
      type: "DownloadStarted",
    }),
  );

  const decoded = decodeNotificationEventWire(encoded);

  assertEquals(decoded._tag, "Success");

  if (decoded._tag === "Success" && decoded.success.type === "DownloadStarted") {
    assertEquals(decoded.success.payload.title, "[SubsPlease] Naruto - 01 (1080p)");
  }
});

it("notification schema accepts auth notification events", () => {
  const passwordChanged = Schema.decodeUnknownResult(NotificationEventSchema)({
    type: "PasswordChanged",
  });
  const apiKeyRegenerated = Schema.decodeUnknownResult(NotificationEventSchema)({
    type: "ApiKeyRegenerated",
  });

  assertEquals(passwordChanged._tag, "Success");
  assertEquals(apiKeyRegenerated._tag, "Success");
});

it("shared seasonal anime schemas accept canonical payloads", () => {
  const seasonalResponse = Schema.decodeUnknownResult(SeasonalMediaResponseSchema)({
    degraded: false,
    has_more: true,
    limit: 25,
    page: 2,
    provider: "anilist",
    season: "spring",
    year: 2026,
    results: [
      {
        already_in_library: false,
        cover_image: "https://cdn.example/cover.jpg",
        format: "TV",
        id: 101,
        season: "spring",
        season_year: 2026,
        start_year: 2026,
        status: "RELEASING",
        title: { romaji: "Kowloon Generic Romance" },
      },
    ],
  });
  const seasonalQueryParams = Schema.decodeUnknownResult(SeasonalMediaQueryParamsSchema)({
    page: 2,
    season: "winter",
    year: 2025,
    limit: 25,
  });

  assertEquals(seasonalResponse._tag, "Success");
  assertEquals(seasonalQueryParams._tag, "Success");
});

it("shared seasonal anime query params reject out-of-range values", () => {
  const badYearAndLimit = Schema.decodeUnknownResult(SeasonalMediaQueryParamsSchema)({
    season: "winter",
    year: 1800,
    limit: 0,
    page: 0,
  });
  const badSeason = Schema.decodeUnknownResult(SeasonalMediaQueryParamsSchema)({
    season: "autumn",
    year: 2025,
    limit: 25,
  });

  assertEquals(badYearAndLimit._tag, "Failure");
  assertEquals(badSeason._tag, "Failure");

  if (badYearAndLimit._tag === "Failure") {
    assertMatch(badYearAndLimit.failure.message, /1970|1/);
  }

  if (badSeason._tag === "Failure") {
    assertMatch(badSeason.failure.message, /winter|spring|summer|fall/);
  }
});

it("shared season helpers resolve season and year window", () => {
  assertEquals(resolveSeasonFromDate(new Date("2025-01-15")), "winter");
  assertEquals(resolveSeasonFromDate(new Date("2025-04-15")), "spring");
  assertEquals(resolveSeasonFromDate(new Date("2025-07-15")), "summer");
  assertEquals(resolveSeasonFromDate(new Date("2025-10-15")), "fall");
  assertEquals(resolveSeasonYearFromDate(new Date("2025-12-15")), 2026);
  assertEquals(resolveSeasonYearFromDate(new Date("2025-06-15")), 2025);

  const window = resolveSeasonWindowFromDate(new Date("2025-12-20"));
  assertEquals(window.season, "winter");
  assertEquals(window.year, 2026);
});
