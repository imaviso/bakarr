use axum::{
    Json,
    extract::{Query, State},
};
use serde::Deserialize;
use std::sync::Arc;

use super::{ApiError, ApiResponse, AppState, DownloadDto};
use crate::api::validation::{validate_anime_id, validate_limit};
use crate::clients::qbittorrent::{QBitClient, sanitize_category};

#[derive(Deserialize)]
pub struct HistoryQuery {
    #[serde(default = "default_limit")]
    pub limit: usize,
}

fn default_limit() -> usize {
    50
}

pub async fn get_history(
    State(state): State<Arc<AppState>>,
    Query(params): Query<HistoryQuery>,
) -> Result<Json<ApiResponse<Vec<DownloadDto>>>, ApiError> {
    validate_limit(params.limit)?;
    let downloads = state.store.recent_downloads(params.limit as i32).await?;

    let mut dtos = Vec::new();

    for d in downloads {
        let anime_title = if let Ok(Some(anime)) = state.store.get_anime(d.anime_id).await {
            anime.title.romaji
        } else {
            "Unknown Anime".to_string()
        };

        let download_date = d.download_date.replace(" ", "T");

        dtos.push(DownloadDto {
            id: d.id,
            anime_id: d.anime_id,
            anime_title,
            torrent_name: d.filename,
            episode_number: d.episode_number as f64,
            group_name: d.group_name,
            download_date,
        });
    }

    Ok(Json(ApiResponse::success(dtos)))
}

pub async fn get_queue(
    State(state): State<Arc<AppState>>,
) -> Result<Json<ApiResponse<Vec<serde_json::Value>>>, ApiError> {
    let config = state.config.read().await;
    let qbit_config = crate::clients::qbittorrent::QBitConfig {
        base_url: config.qbittorrent.url.clone(),
        username: config.qbittorrent.username.clone(),
        password: config.qbittorrent.password.clone(),
    };

    let qbit = QBitClient::new(qbit_config);

    match qbit.get_torrents(None).await {
        Ok(torrents) => {
            let active_torrents: Vec<_> = torrents
                .into_iter()
                .filter(|t| {
                    use crate::clients::qbittorrent::TorrentState;
                    matches!(
                        t.state,
                        TorrentState::Downloading
                            | TorrentState::StalledDL
                            | TorrentState::MetaDL
                            | TorrentState::QueuedDL
                            | TorrentState::CheckingDL
                            | TorrentState::Allocating
                            | TorrentState::ForcedDL
                    )
                })
                .collect();

            let mut results = Vec::new();
            for t in active_torrents {
                let db_entry = state
                    .store
                    .get_download_by_hash(&t.hash)
                    .await
                    .unwrap_or(None);

                let (id, anime_id, anime_title, episode_number) = if let Some(entry) = db_entry {
                    let title = if let Ok(Some(anime)) = state.store.get_anime(entry.anime_id).await
                    {
                        anime.title.romaji
                    } else {
                        "Unknown Anime".to_string()
                    };
                    (entry.id, entry.anime_id, title, entry.episode_number)
                } else {
                    (0, 0, "Unknown (Manual)".to_string(), 0.0)
                };

                results.push(serde_json::json!({
                    "id": id,
                    "anime_id": anime_id,
                    "anime_title": anime_title,
                    "episode_number": episode_number,
                    "torrent_name": t.name,
                    "status": t.state.to_string(),
                    "progress": t.progress * 100.0, 
                    "added_at": chrono::DateTime::from_timestamp(t.added_on, 0).unwrap_or_default().to_rfc3339(),
                    "hash": t.hash,
                    "size": t.size,
                    "downloaded": t.downloaded,
                    "dlspeed": t.dlspeed,
                    "eta": t.eta,
                }));
            }

            Ok(Json(ApiResponse::success(results)))
        }
        Err(e) => Err(ApiError::qbittorrent_error(e.to_string())),
    }
}

#[derive(Deserialize)]
pub struct SearchMissingRequest {
    pub anime_id: Option<i32>,
}

pub async fn search_missing(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<SearchMissingRequest>,
) -> Result<Json<ApiResponse<String>>, ApiError> {
    if let Some(anime_id) = payload.anime_id {
        validate_anime_id(anime_id)?;

        let (title, category) = if let Some(a) = state.store.get_anime(anime_id).await? {
            (a.title.romaji.clone(), sanitize_category(&a.title.romaji))
        } else {
            return Err(ApiError::anime_not_found(anime_id));
        };

        let _ = state
            .event_bus
            .send(crate::api::NotificationEvent::SearchMissingStarted {
                anime_id,
                title: title.clone(),
            });

        let state_clone = state.clone();
        tokio::spawn(async move {
            match state_clone.search_service.search_anime(anime_id).await {
                Ok(results) => {
                    let mut count = 0;
                    for result in results {
                        if result.download_action.should_download()
                            && let Some(qbit) = &state_clone.qbit
                        {
                            if let Err(e) =
                                qbit.add_magnet(&result.link, None, Some(&category)).await
                            {
                                tracing::error!("Failed to add torrent: {}", e);
                                continue;
                            }

                            if let Err(e) = state_clone
                                .store
                                .record_download(
                                    anime_id,
                                    &result.title,
                                    result.episode_number,
                                    result.group.as_deref(),
                                    Some(&result.info_hash),
                                )
                                .await
                            {
                                tracing::error!("Failed to record download: {}", e);
                            }

                            count += 1;
                        }
                    }

                    let _ = state_clone.event_bus.send(
                        crate::api::NotificationEvent::SearchMissingFinished {
                            anime_id,
                            title,
                            count,
                        },
                    );
                }
                Err(e) => {
                    let _ = state_clone
                        .event_bus
                        .send(crate::api::NotificationEvent::Error {
                            message: format!("Search failed: {}", e),
                        });
                }
            }
        });

        Ok(Json(ApiResponse::success(
            "Search for missing episodes triggered".to_string(),
        )))
    } else {
        Ok(Json(ApiResponse::success(
            "Global search not yet implemented".to_string(),
        )))
    }
}
