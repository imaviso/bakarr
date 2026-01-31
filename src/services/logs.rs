use crate::db::Store;
use crate::domain::events::NotificationEvent;
use std::sync::Arc;
use tokio::sync::broadcast;
use tracing::error;

pub struct LogService {
    store: Store,
    event_bus: broadcast::Sender<NotificationEvent>,
}

impl LogService {
    #[must_use]
    pub const fn new(store: Store, event_bus: broadcast::Sender<NotificationEvent>) -> Self {
        Self { store, event_bus }
    }

    pub fn start_listener(self: Arc<Self>) {
        let mut rx = self.event_bus.subscribe();
        let service = self;

        tokio::spawn(async move {
            loop {
                match rx.recv().await {
                    Ok(event) => {
                        if let Err(e) = service.handle_event(event).await {
                            error!(error = %e, "Failed to save log");
                        }
                    }
                    Err(broadcast::error::RecvError::Lagged(count)) => {
                        error!(count, "Log listener lagged");
                    }
                    Err(broadcast::error::RecvError::Closed) => {
                        error!("Log listener event bus closed");
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
                format!("Started download: {title}"),
                None,
            ),
            NotificationEvent::DownloadFinished { title } => (
                "DownloadFinished".to_string(),
                "success",
                format!("Finished download: {title}"),
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
                        format!("Import finished: {imported} imported, {failed} failed"),
                        Some(serde_json::to_string(&event)?),
                    )
                } else {
                    return Ok(());
                }
            }
            NotificationEvent::RssCheckFinished { new_items, .. } => (
                "RssCheckFinished".to_string(),
                "info",
                format!("RSS Check finished: {new_items} new items"),
                Some(serde_json::to_string(&event)?),
            ),

            NotificationEvent::ScanProgress { .. }
            | NotificationEvent::LibraryScanProgress { .. }
            | NotificationEvent::RssCheckProgress { .. }
            | NotificationEvent::DownloadProgress { .. } => return Ok(()),

            _ => {
                let type_name = format!("{event:?}")
                    .split_whitespace()
                    .next()
                    .unwrap_or("Unknown")
                    .to_string();

                let variant_name = type_name
                    .split('{')
                    .next()
                    .unwrap_or("Unknown")
                    .trim()
                    .to_string();

                (
                    variant_name.clone(),
                    "info",
                    format!("Event: {variant_name}"),
                    Some(serde_json::to_string(&event)?),
                )
            }
        };

        self.store
            .add_log(&event_type, level, &message, details)
            .await?;

        Ok(())
    }
}
