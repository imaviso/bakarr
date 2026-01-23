use crate::api::NotificationEvent;
use crate::db::Store;
use std::sync::Arc;
use tokio::sync::broadcast;
use tracing::{debug, error};

pub struct LogService {
    store: Store,
    event_bus: broadcast::Sender<NotificationEvent>,
}

impl LogService {
    pub fn new(store: Store, event_bus: broadcast::Sender<NotificationEvent>) -> Self {
        Self { store, event_bus }
    }

    pub fn start_listener(self: Arc<Self>) {
        let mut rx = self.event_bus.subscribe();
        let service = self.clone();

        tokio::spawn(async move {
            loop {
                match rx.recv().await {
                    Ok(event) => {
                        if let Err(e) = service.handle_event(event).await {
                            error!("Failed to save log: {}", e);
                        }
                    }
                    Err(broadcast::error::RecvError::Lagged(count)) => {
                        debug!("Log listener lagged by {} messages", count);
                    }
                    Err(broadcast::error::RecvError::Closed) => {
                        debug!("Log listener event bus closed");
                        break;
                    }
                }
            }
        });
    }

    async fn handle_event(&self, event: NotificationEvent) -> anyhow::Result<()> {
        let (event_type, level, message, details) = match &event {
            NotificationEvent::ScanStarted => (
                "ScanStarted".to_string(),
                "info",
                "Library scan started".to_string(),
                None,
            ),
            NotificationEvent::ScanFinished => (
                "ScanFinished".to_string(),
                "info",
                "Library scan finished".to_string(),
                None,
            ),
            NotificationEvent::DownloadStarted { title } => (
                "DownloadStarted".to_string(),
                "info",
                format!("Started download: {}", title),
                None,
            ),
            NotificationEvent::DownloadFinished { title } => (
                "DownloadFinished".to_string(),
                "success",
                format!("Finished download: {}", title),
                None,
            ),
            NotificationEvent::Error { message } => {
                ("Error".to_string(), "error", message.clone(), None)
            }
            NotificationEvent::Info { message } => {
                ("Info".to_string(), "info", message.clone(), None)
            }
            NotificationEvent::ImportFinished {
                imported, failed, ..
            } => {
                if *imported > 0 || *failed > 0 {
                    (
                        "ImportFinished".to_string(),
                        if *failed > 0 { "warn" } else { "success" },
                        format!("Import finished: {} imported, {} failed", imported, failed),
                        Some(serde_json::to_string(&event)?),
                    )
                } else {
                    return Ok(()); // Skip empty imports
                }
            }
            NotificationEvent::RssCheckFinished { new_items, .. } => {
                if *new_items > 0 {
                    (
                        "RssCheckFinished".to_string(),
                        "info",
                        format!("RSS Check finished: {} new items", new_items),
                        Some(serde_json::to_string(&event)?),
                    )
                } else {
                    return Ok(()); // Skip if no new items
                }
            }
            // Skip high-frequency progress events to avoid spamming the DB
            NotificationEvent::ScanProgress { .. }
            | NotificationEvent::LibraryScanProgress { .. }
            | NotificationEvent::RssCheckProgress { .. }
            | NotificationEvent::DownloadProgress { .. } => return Ok(()),

            // Default handling for other events
            _ => {
                let type_name = format!("{:?}", event)
                    .split_whitespace()
                    .next()
                    .unwrap_or("Unknown")
                    .to_string();
                // Clean up the debug string to just get the variant name roughly
                let variant_name = type_name
                    .split('{')
                    .next()
                    .unwrap_or("Unknown")
                    .trim()
                    .to_string();

                (
                    variant_name.clone(),
                    "info",
                    format!("Event: {}", variant_name),
                    Some(serde_json::to_string(&event)?),
                )
            }
        };

        // Normalize level for frontend badges
        // "success" isn't a standard log level, but useful for UI.
        // We can map it to "info" for storage if we want strict levels, or keep it.
        // Let's keep it as string in DB.

        self.store
            .add_log(&event_type, level, &message, details)
            .await?;

        Ok(())
    }
}
