//! Events API module.
//!
//! This module provides SSE (Server-Sent Events) endpoint for real-time
//! notifications. Event types are defined in the domain layer.

use axum::{
    Router,
    extract::State,
    response::sse::{Event, KeepAlive, Sse},
    routing::get,
};
use futures::stream::{self, Stream};
use std::{convert::Infallible, sync::Arc, time::Duration};
use tokio::sync::broadcast;
use tracing::warn;

use crate::api::AppState;

pub use crate::domain::events::{DownloadStatus, NotificationEvent};

pub fn router() -> Router<Arc<AppState>> {
    Router::new().route("/events", get(sse_handler))
}

async fn sse_handler(
    State(state): State<Arc<AppState>>,
) -> Sse<impl Stream<Item = Result<Event, Infallible>>> {
    let rx = state.event_bus().subscribe();

    let stream = stream::unfold(rx, |mut rx| async move {
        match rx.recv().await {
            Ok(event) => match serde_json::to_string(&event) {
                Ok(json) => Some((Ok(Event::default().data(json)), rx)),
                Err(e) => {
                    warn!(error = %e, "Failed to serialize SSE event, skipping");
                    Some((
                        Ok(Event::default()
                            .event("error")
                            .data("Event serialization failed")),
                        rx,
                    ))
                }
            },
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
