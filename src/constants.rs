pub const VIDEO_EXTENSIONS: &[&str] = &["mkv", "mp4", "avi", "webm", "mov", "wmv", "flv", "m4v"];

pub mod cache {

    pub const SEADEX_TTL_HOURS: i64 = 24;

    pub const EPISODE_METADATA_TTL_DAYS: i64 = 7;
}

pub mod intervals {
    use std::time::Duration;

    pub const DOWNLOAD_CHECK: Duration = Duration::from_secs(10);

    pub const PROGRESS_BROADCAST: Duration = Duration::from_secs(2);
}

pub mod quality {

    pub const DEFAULT_PROFILE_ID: i32 = 1;
}

pub mod limits {

    pub const MAX_SEARCH_RESULTS: usize = 10;

    pub const DEFAULT_HISTORY_LIMIT: i32 = 10;
}
