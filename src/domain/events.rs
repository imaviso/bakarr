//! Domain events for the application.
//!
//! This module contains event types used for notifications across the system.
//! These events are sent via the event bus to notify clients of system state changes.

use serde::Serialize;

/// Events sent to connected clients via SSE (Server-Sent Events).
#[derive(Clone, Debug, Serialize)]
#[serde(tag = "type", content = "payload")]
pub enum NotificationEvent {
    ScanStarted,
    ScanFinished,
    ScanProgress {
        current: usize,
        total: usize,
    },
    DownloadStarted {
        title: String,
    },
    DownloadFinished {
        title: String,
    },

    RefreshStarted {
        anime_id: i32,
        title: String,
    },
    RefreshFinished {
        anime_id: i32,
        title: String,
    },

    SearchMissingStarted {
        anime_id: i32,
        title: String,
    },
    SearchMissingFinished {
        anime_id: i32,
        title: String,
        count: i32,
    },

    ScanFolderStarted {
        anime_id: i32,
        title: String,
    },
    ScanFolderFinished {
        anime_id: i32,
        title: String,
        found: i32,
    },

    RenameStarted {
        anime_id: i32,
        title: String,
    },
    RenameFinished {
        anime_id: i32,
        title: String,
        count: i32,
    },

    ImportStarted {
        count: i32,
    },
    ImportFinished {
        count: i32,
        imported: i32,
        failed: i32,
    },

    LibraryScanStarted,
    LibraryScanFinished {
        scanned: i32,
        matched: i32,
        updated: i32,
    },
    LibraryScanProgress {
        scanned: i32,
    },

    RssCheckStarted,
    RssCheckFinished {
        total_feeds: i32,
        new_items: i32,
    },
    RssCheckProgress {
        current: i32,
        total: i32,
        feed_name: String,
    },

    Error {
        message: String,
    },
    Info {
        message: String,
    },

    DownloadProgress {
        downloads: Vec<DownloadStatus>,
    },

    SystemStatus(crate::api::types::SystemStatus),
}

/// Status of an active download.
#[derive(Clone, Debug, Serialize)]
pub struct DownloadStatus {
    pub hash: String,
    pub name: String,
    pub progress: f32,
    pub speed: i64,
    pub eta: i64,
    pub state: String,
    pub total_bytes: i64,
    pub downloaded_bytes: i64,
}
