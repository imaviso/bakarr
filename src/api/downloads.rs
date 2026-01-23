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
    let downloads = state.store().recent_downloads(params.limit as i32).await?;

    let mut dtos = Vec::new();

    for d in downloads {
        let anime_title = if let Ok(Some(anime)) = state.store().get_anime(d.anime_id).await {
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
    let config = state.config().read().await;
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
                    .store()
                    .get_download_by_hash(&t.hash)
                    .await
                    .unwrap_or(None);

                let (id, anime_id, anime_title, episode_number) = if let Some(entry) = db_entry {
                    let title =
                        if let Ok(Some(anime)) = state.store().get_anime(entry.anime_id).await {
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

        let (title, category) = if let Some(a) = state.store().get_anime(anime_id).await? {
            (a.title.romaji.clone(), sanitize_category(&a.title.romaji))
        } else {
            return Err(ApiError::anime_not_found(anime_id));
        };

        let _ = state
            .event_bus()
            .send(crate::api::NotificationEvent::SearchMissingStarted {
                anime_id,
                title: title.clone(),
            });

        let state_clone = state.clone();
        tokio::spawn(async move {
            match state_clone.search_service().search_anime(anime_id).await {
                Ok(results) => {
                    let mut count = 0;
                    for result in results {
                        if result.download_action.should_download()
                            && let Some(qbit) = &state_clone.qbit()
                        {
                            if let Err(e) =
                                qbit.add_magnet(&result.link, None, Some(&category)).await
                            {
                                tracing::error!("Failed to add torrent: {}", e);
                                continue;
                            }

                            if let Err(e) = state_clone
                                .store()
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

                    let _ = state_clone.event_bus().send(
                        crate::api::NotificationEvent::SearchMissingFinished {
                            anime_id,
                            title,
                            count,
                        },
                    );
                }
                Err(e) => {
                    let _ = state_clone
                        .event_bus()
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
        // Global search for all missing episodes
        let state_clone = state.clone();
        tokio::spawn(async move {
            tracing::info!("Starting global missing episode search");
            let _ = state_clone
                .event_bus()
                .send(crate::api::NotificationEvent::Info {
                    message: "Starting global search for missing episodes".to_string(),
                });

            // 1. Get all missing episodes (limit 1000 to be safe/sane)
            let missing_episodes = match state_clone.store().get_all_missing_episodes(1000).await {
                Ok(eps) => eps,
                Err(e) => {
                    tracing::error!("Failed to fetch missing episodes: {}", e);
                    return;
                }
            };

            if missing_episodes.is_empty() {
                tracing::info!("No missing episodes found");
                return;
            }

            // 2. Group by anime_id to avoid redundant searches (search_anime gets all missing for that anime)
            let mut unique_anime_ids = std::collections::HashSet::new();
            for ep in &missing_episodes {
                unique_anime_ids.insert(ep.anime_id as i32);
            }

            tracing::info!(
                "Found {} missing episodes across {} series",
                missing_episodes.len(),
                unique_anime_ids.len()
            );

            // 3. Iterate and search
            let mut total_added = 0;
            for (idx, anime_id) in unique_anime_ids.iter().enumerate() {
                // Rate limiting: sleep 10s between anime to be nice to Nyaa
                if idx > 0 {
                    tokio::time::sleep(tokio::time::Duration::from_secs(10)).await;
                }

                let anime_title = match state_clone.store().get_anime(*anime_id).await {
                    Ok(Some(a)) => a.title.romaji,
                    _ => format!("Anime #{}", anime_id),
                };

                tracing::info!(
                    "Searching missing for '{}' ({}/{})",
                    anime_title,
                    idx + 1,
                    unique_anime_ids.len()
                );

                // Use the search_anime logic which already handles filtering/decision making
                // and returns valid candidates
                match state_clone.search_service().search_anime(*anime_id).await {
                    Ok(results) => {
                        let mut added_for_anime = 0;
                        let category = crate::clients::qbittorrent::sanitize_category(&anime_title);

                        for result in results {
                            if result.download_action.should_download()
                                && let Some(qbit) = &state_clone.qbit()
                            {
                                if let Err(e) =
                                    qbit.add_magnet(&result.link, None, Some(&category)).await
                                {
                                    tracing::error!("Failed to add torrent: {}", e);
                                    continue;
                                }

                                if let Err(e) = state_clone
                                    .store()
                                    .record_download(
                                        *anime_id,
                                        &result.title,
                                        result.episode_number,
                                        result.group.as_deref(),
                                        Some(&result.info_hash),
                                    )
                                    .await
                                {
                                    tracing::error!("Failed to record download: {}", e);
                                }

                                added_for_anime += 1;
                            }
                        }
                        total_added += added_for_anime;
                        tracing::info!("Added {} torrents for '{}'", added_for_anime, anime_title);
                    }
                    Err(e) => {
                        tracing::error!("Failed to search for anime {}: {}", anime_id, e);
                    }
                }
            }

            tracing::info!(
                "Global search complete. Total torrents added: {}",
                total_added
            );
            let _ = state_clone
                .event_bus()
                .send(crate::api::NotificationEvent::Info {
                    message: format!("Global search complete. Added {} torrents.", total_added),
                });
        });

        Ok(Json(ApiResponse::success(
            "Global search triggered in background".to_string(),
        )))
    }
}
