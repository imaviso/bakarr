//! `SeaORM` implementation of the `SystemService` trait.

use crate::api::types::{DiskSpaceDto, LogDto, LogResponse, SystemStatus};
use crate::clients::qbittorrent::QBitClient;
use crate::config::Config;
use crate::db::Store;
use crate::domain::events::NotificationEvent;
use crate::services::system_service::{ExportFormat, SystemError, SystemService};
use async_trait::async_trait;
use std::fmt::Write;
use std::sync::Arc;
use tokio::sync::{RwLock, broadcast};
use tokio::time::{Duration, interval};

const PASSWORD_MASK: &str = "********";

pub struct SeaOrmSystemService {
    store: Store,
    config: Arc<RwLock<Config>>,
    qbit: Option<Arc<QBitClient>>,
}

impl SeaOrmSystemService {
    #[must_use]
    pub const fn new(
        store: Store,
        config: Arc<RwLock<Config>>,
        qbit: Option<Arc<QBitClient>>,
    ) -> Self {
        Self {
            store,
            config,
            qbit,
        }
    }

    /// Formats logs as CSV.
    fn format_logs_as_csv(logs: Vec<LogDto>) -> String {
        let mut csv = String::from("id,created_at,level,event_type,message,details\n");
        for log in logs {
            let _ = writeln!(
                csv,
                "{},{},{},{},\"{}\",\"{}\"",
                log.id,
                log.created_at,
                log.level,
                log.event_type,
                log.message.replace('"', "\"\""),
                log.details.unwrap_or_default().replace('"', "\"\"")
            );
        }
        csv
    }
}

#[async_trait]
impl SystemService for SeaOrmSystemService {
    async fn get_status(
        &self,
        uptime_secs: u64,
        version: &str,
    ) -> Result<SystemStatus, SystemError> {
        let monitored = self.store.list_monitored().await?;

        let mut total_episodes = 0i64;
        let mut missing_episodes = 0i64;

        let anime_ids: Vec<i32> = monitored.iter().map(|a| a.id).collect();
        let downloaded_map = self
            .store
            .get_download_counts_for_anime_ids(&anime_ids)
            .await
            .unwrap_or_default();

        for anime in &monitored {
            if let Some(count) = anime.episode_count {
                total_episodes += i64::from(count);
                let downloaded = downloaded_map.get(&anime.id).copied().unwrap_or(0);
                missing_episodes += i64::from(count) - i64::from(downloaded);
            }
        }

        let (active_torrents, pending_downloads) = if let Some(ref qbit) = self.qbit {
            let active =
                i64::try_from(qbit.get_torrent_count().await.unwrap_or(0)).unwrap_or(i64::MAX);
            let pending =
                i64::try_from(qbit.get_downloading_count().await.unwrap_or(0)).unwrap_or(i64::MAX);
            (active, pending)
        } else {
            (0, 0)
        };

        let (free_space, total_space) = {
            let config = self.config.read().await;
            self.get_disk_space(&config.library.library_path)
                .await?
                .unwrap_or((0, 0))
        };

        let last_scan = self
            .store
            .get_latest_log_time("ScanFinished")
            .await
            .unwrap_or(None);
        let last_rss = self
            .store
            .get_latest_log_time("RssCheckFinished")
            .await
            .unwrap_or(None);

        Ok(SystemStatus {
            version: version.to_string(),
            uptime: uptime_secs,
            monitored_anime: monitored.len(),
            total_episodes,
            missing_episodes,
            active_torrents,
            pending_downloads,
            disk_space: DiskSpaceDto {
                free: free_space,
                total: total_space,
            },
            last_scan,
            last_rss,
        })
    }

    async fn get_config(&self) -> Result<Config, SystemError> {
        let mut safe_config = self.config.read().await.clone();

        if !safe_config.qbittorrent.password.is_empty() {
            safe_config.qbittorrent.password = PASSWORD_MASK.to_string();
        }

        Ok(safe_config)
    }

    async fn update_config(
        &self,
        mut new_config: Config,
        password_mask: &str,
    ) -> Result<(), SystemError> {
        let mut config = self.config.write().await;

        if new_config.qbittorrent.password == password_mask {
            new_config
                .qbittorrent
                .password
                .clone_from(&config.qbittorrent.password);
        }

        *config = new_config;

        config
            .save()
            .map_err(|e| SystemError::Internal(e.to_string()))?;
        drop(config);

        Ok(())
    }

    async fn get_disk_space(&self, path: &str) -> Result<Option<(i64, i64)>, SystemError> {
        // CPU-intensive operation - run in blocking task
        let path = path.to_string();
        let result = tokio::task::spawn_blocking(move || {
            // Try to use sysinfo crate if available, otherwise use df command
            Self::get_disk_space_blocking(&path)
        })
        .await
        .map_err(|e| SystemError::Internal(e.to_string()))?;

        Ok(result)
    }

    async fn get_logs(
        &self,
        page: u64,
        page_size: u64,
        level: Option<String>,
        event_type: Option<String>,
        start_date: Option<String>,
        end_date: Option<String>,
    ) -> Result<LogResponse, SystemError> {
        if page == 0 {
            return Err(SystemError::Validation(
                "Page number must be >= 1".to_string(),
            ));
        }

        let (logs, total_pages) = self
            .store
            .get_logs(page, page_size, level, event_type, start_date, end_date)
            .await?;

        let dtos: Vec<LogDto> = logs
            .into_iter()
            .map(|model| LogDto {
                id: model.id,
                event_type: model.event_type,
                level: model.level,
                message: model.message,
                details: model.details,
                created_at: model.created_at,
            })
            .collect();

        Ok(LogResponse {
            logs: dtos,
            total_pages,
        })
    }

    async fn export_logs(
        &self,
        format: ExportFormat,
        level: Option<String>,
        event_type: Option<String>,
        start_date: Option<String>,
        end_date: Option<String>,
    ) -> Result<(ExportFormat, String), SystemError> {
        let logs = self
            .store
            .get_all_logs(level, event_type, start_date, end_date)
            .await?;

        let dtos: Vec<LogDto> = logs
            .into_iter()
            .map(|model| LogDto {
                id: model.id,
                event_type: model.event_type,
                level: model.level,
                message: model.message,
                details: model.details,
                created_at: model.created_at,
            })
            .collect();

        let content = if format == ExportFormat::Csv {
            Self::format_logs_as_csv(dtos)
        } else {
            serde_json::to_string_pretty(&dtos).map_err(|e| SystemError::Internal(e.to_string()))?
        };

        Ok((format, content))
    }

    async fn clear_logs(&self) -> Result<bool, SystemError> {
        self.store.clear_logs().await?;
        Ok(true)
    }

    fn start_status_broadcaster(
        self: Arc<Self>,
        event_bus: broadcast::Sender<NotificationEvent>,
        uptime_secs: Arc<dyn Fn() -> u64 + Send + Sync>,
        version: String,
    ) {
        tokio::spawn(async move {
            let mut ticker = interval(Duration::from_secs(5));
            loop {
                ticker.tick().await;
                let uptime = uptime_secs();
                match self.get_status(uptime, &version).await {
                    Ok(status) => {
                        let _ = event_bus.send(NotificationEvent::SystemStatus(status));
                    }
                    Err(e) => {
                        tracing::error!("Failed to get system status: {}", e);
                    }
                }
            }
        });
    }
}

impl SeaOrmSystemService {
    /// Gets disk space using the df command (Unix-like systems).
    fn get_disk_space_blocking(path: &str) -> Option<(i64, i64)> {
        use std::process::Command;

        let output = Command::new("df").arg("-B1").arg(path).output().ok()?;

        if !output.status.success() {
            return None;
        }

        let stdout = String::from_utf8_lossy(&output.stdout);

        let line = stdout.lines().nth(1)?;
        let parts: Vec<&str> = line.split_whitespace().collect();

        if parts.len() >= 4 {
            let total = parts[1].parse().ok()?;
            let free = parts[3].parse().ok()?;
            Some((free, total))
        } else {
            None
        }
    }
}
