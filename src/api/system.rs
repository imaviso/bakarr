use axum::{Json, extract::State};
use std::sync::Arc;

use super::{ApiError, ApiResponse, AppState, SystemStatus};
use crate::config::Config;

const MASK: &str = "********";

pub async fn get_status(
    State(state): State<Arc<AppState>>,
) -> Result<Json<ApiResponse<SystemStatus>>, ApiError> {
    let monitored = state.store.list_monitored().await?;

    let mut total_episodes = 0i64;
    let mut missing_episodes = 0i64;

    let anime_ids: Vec<i32> = monitored.iter().map(|a| a.id).collect();
    let downloaded_map = state
        .store
        .get_download_counts_for_anime_ids(&anime_ids)
        .await
        .unwrap_or_default();

    for anime in &monitored {
        if let Some(count) = anime.episode_count {
            total_episodes += count as i64;
            let downloaded = downloaded_map.get(&anime.id).copied().unwrap_or(0);
            missing_episodes += (count as i64) - (downloaded as i64);
        }
    }

    let (active_torrents, pending_downloads) = if let Some(qbit) = &state.qbit {
        let active = qbit.get_torrent_count().await.unwrap_or(0) as i64;
        let pending = qbit.get_downloading_count().await.unwrap_or(0) as i64;
        (active, pending)
    } else {
        (0, 0)
    };

    let config = state.config.read().await;
    let path = &config.library.library_path;
    let (free_space, total_space) = get_disk_space(path).unwrap_or((0, 0));

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
    };

    Ok(Json(ApiResponse::success(status)))
}

fn get_disk_space(path: &str) -> Option<(i64, i64)> {
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

pub async fn get_config(
    State(state): State<Arc<AppState>>,
) -> Result<Json<ApiResponse<Config>>, ApiError> {
    let config = state.config.read().await;
    let mut safe_config = config.clone();

    if !safe_config.qbittorrent.password.is_empty() {
        safe_config.qbittorrent.password = MASK.to_string();
    }
    if !safe_config.auth.password.is_empty() {
        safe_config.auth.password = MASK.to_string();
    }

    Ok(Json(ApiResponse::success(safe_config)))
}

pub async fn update_config(
    State(state): State<Arc<AppState>>,
    Json(mut new_config): Json<Config>,
) -> Result<Json<ApiResponse<()>>, ApiError> {
    let mut config = state.config.write().await;

    if new_config.qbittorrent.password == MASK {
        new_config.qbittorrent.password = config.qbittorrent.password.clone();
    }
    if new_config.auth.password == MASK {
        new_config.auth.password = config.auth.password.clone();
    }
    if new_config.auth.api_key == MASK {
        new_config.auth.api_key = config.auth.api_key.clone();
    }

    *config = new_config;

    config
        .save()
        .map_err(|e| ApiError::internal(e.to_string()))?;

    Ok(Json(ApiResponse::success(())))
}
