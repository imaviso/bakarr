//! Application-wide constants
//!
//! Centralizes magic values that are used across multiple modules.

/// Video file extensions recognized by the application.
/// Used for library scanning, import, and file detection.
pub const VIDEO_EXTENSIONS: &[&str] = &["mkv", "mp4", "avi", "webm", "mov", "wmv", "flv", "m4v"];

/// Default cache TTL values (in seconds)
pub mod cache {
    /// SeaDex cache freshness duration (24 hours)
    pub const SEADEX_TTL_HOURS: i64 = 24;

    /// Episode metadata cache freshness duration (7 days)
    pub const EPISODE_METADATA_TTL_DAYS: i64 = 7;
}

/// Download monitoring intervals
pub mod intervals {
    use std::time::Duration;

    /// How often to check for completed downloads
    pub const DOWNLOAD_CHECK: Duration = Duration::from_secs(10);

    /// How often to broadcast download progress to SSE clients
    pub const PROGRESS_BROADCAST: Duration = Duration::from_secs(2);
}

/// Default quality profile values
pub mod quality {
    /// Default quality profile ID when none specified
    pub const DEFAULT_PROFILE_ID: i32 = 1;
}

/// API limits
pub mod limits {
    /// Maximum search results to return
    pub const MAX_SEARCH_RESULTS: usize = 10;

    /// Default recent download history limit
    pub const DEFAULT_HISTORY_LIMIT: i32 = 10;
}
