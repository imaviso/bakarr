use axum::{Json, extract::State};
use std::sync::Arc;

use super::{ApiError, ApiResponse, AppState, SystemStatus};
use crate::config::Config;

pub mod logs;
pub use logs::{clear_logs, get_logs};

const MASK: &str = "********";

pub async fn get_status(
    State(state): State<Arc<AppState>>,
) -> Result<Json<ApiResponse<SystemStatus>>, ApiError> {
    let monitored = state.store().list_monitored().await?;

    let mut total_episodes = 0i64;
    let mut missing_episodes = 0i64;

    let anime_ids: Vec<i32> = monitored.iter().map(|a| a.id).collect();
    let downloaded_map = state
        .store()
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

    let (active_torrents, pending_downloads) = if let Some(qbit) = state.qbit() {
        let active = i64::try_from(qbit.get_torrent_count().await.unwrap_or(0)).unwrap_or(i64::MAX);
        let pending =
            i64::try_from(qbit.get_downloading_count().await.unwrap_or(0)).unwrap_or(i64::MAX);
        (active, pending)
    } else {
        (0, 0)
    };

    let (free_space, total_space) = {
        let config = state.config().read().await;
        get_disk_space(&config.library.library_path)
            .await
            .unwrap_or((0, 0))
    };

    let last_scan = state
        .store()
        .get_latest_log_time("ScanFinished")
        .await
        .unwrap_or(None);
    let last_rss = state
        .store()
        .get_latest_log_time("RssCheckFinished")
        .await
        .unwrap_or(None);

    let status = SystemStatus {
        version: env!("CARGO_PKG_VERSION").to_string(),
        uptime: state.start_time.elapsed().as_secs(),
        monitored_anime: monitored.len(),
        total_episodes,
        missing_episodes,
        active_torrents,
        pending_downloads,
        disk_space: super::DiskSpaceDto {
            free: free_space,
            total: total_space,
        },
        last_scan,
        last_rss,
    };

    Ok(Json(ApiResponse::success(status)))
}

async fn get_disk_space(path: &str) -> Option<(i64, i64)> {
    let output = tokio::process::Command::new("df")
        .arg("-B1")
        .arg(path)
        .output()
        .await
        .ok()?;

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

pub async fn get_config(
    State(state): State<Arc<AppState>>,
) -> Result<Json<ApiResponse<Config>>, ApiError> {
    let mut safe_config = state.config().read().await.clone();

    if !safe_config.qbittorrent.password.is_empty() {
        safe_config.qbittorrent.password = MASK.to_string();
    }

    Ok(Json(ApiResponse::success(safe_config)))
}

pub async fn update_config(
    State(state): State<Arc<AppState>>,
    Json(mut new_config): Json<Config>,
) -> Result<Json<ApiResponse<()>>, ApiError> {
    let mut config = state.config().write().await;

    if new_config.qbittorrent.password == MASK {
        new_config
            .qbittorrent
            .password
            .clone_from(&config.qbittorrent.password);
    }

    *config = new_config;

    let res = config.save().map_err(|e| ApiError::internal(e.to_string()));

    drop(config);
    res?;

    Ok(Json(ApiResponse::success(())))
}
