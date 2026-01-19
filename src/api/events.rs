use axum::{
    Router,
    extract::State,
    response::sse::{Event, KeepAlive, Sse},
    routing::get,
};
use futures::stream::{self, Stream};
use serde::Serialize;
use std::{convert::Infallible, sync::Arc, time::Duration};
use tokio::sync::broadcast;
use tracing::warn;

use crate::api::AppState;

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
}

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

pub fn router() -> Router<Arc<AppState>> {
    Router::new().route("/events", get(sse_handler))
}

async fn sse_handler(
    State(state): State<Arc<AppState>>,
) -> Sse<impl Stream<Item = Result<Event, Infallible>>> {
    let rx = state.event_bus.subscribe();

    let stream = stream::unfold(rx, |mut rx| async move {
        match rx.recv().await {
            Ok(event) => {
                let json = serde_json::to_string(&event).unwrap_or_default();
                Some((Ok(Event::default().data(json)), rx))
            }
            Err(broadcast::error::RecvError::Lagged(count)) => {
                warn!("Client lagged by {} messages", count);

                Some((
                    Ok(Event::default().event("warning").data("Missed some events")),
                    rx,
                ))
            }
            Err(broadcast::error::RecvError::Closed) => None,
        }
    });

    Sse::new(stream).keep_alive(KeepAlive::new().interval(Duration::from_secs(15)))
}
