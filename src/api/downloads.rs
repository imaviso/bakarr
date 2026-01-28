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

const fn default_limit() -> usize {
    50
}

pub async fn get_history(
    State(state): State<Arc<AppState>>,
    Query(params): Query<HistoryQuery>,
) -> Result<Json<ApiResponse<Vec<DownloadDto>>>, ApiError> {
    validate_limit(params.limit)?;
    let limit = i32::try_from(params.limit).unwrap_or(i32::MAX);
    let downloads = state.store().recent_downloads(limit).await?;

    let mut dtos = Vec::new();

    for d in downloads {
        let anime_title = if let Ok(Some(anime)) = state.store().get_anime(d.anime_id).await {
            anime.title.romaji
        } else {
            "Unknown Anime".to_string()
        };

        let download_date = d.download_date.replace(' ', "T");

        dtos.push(DownloadDto {
            id: d.id,
            anime_id: d.anime_id,
            anime_title,
            torrent_name: d.filename,
            episode_number: f64::from(d.episode_number),
            group_name: d.group_name,
            download_date,
        });
    }

    Ok(Json(ApiResponse::success(dtos)))
}

pub async fn get_queue(
    State(state): State<Arc<AppState>>,
) -> Result<Json<ApiResponse<Vec<serde_json::Value>>>, ApiError> {
    let qbit_config = {
        let config = state.config().read().await;
        crate::clients::qbittorrent::QBitConfig {
            base_url: config.qbittorrent.url.clone(),
            username: config.qbittorrent.username.clone(),
            password: config.qbittorrent.password.clone(),
        }
    };

    let qbit = QBitClient::new(qbit_config);

    match qbit.get_torrents(None, None).await {
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

#[derive(Deserialize, Default)]
pub struct SearchMissingRequest {
    pub anime_id: Option<i32>,
}

pub async fn search_missing(
    State(state): State<Arc<AppState>>,
    body: Option<Json<SearchMissingRequest>>,
) -> Result<Json<ApiResponse<String>>, ApiError> {
    let payload = body.map(|j| j.0).unwrap_or_default();

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
            match perform_search_and_download(&state_clone, anime_id, &category).await {
                Ok(count) => {
                    let _ = state_clone.event_bus().send(
                        crate::api::NotificationEvent::SearchMissingFinished {
                            anime_id,
                            title,
                            count: i32::try_from(count).unwrap_or(i32::MAX),
                        },
                    );
                }
                Err(e) => {
                    let _ = state_clone
                        .event_bus()
                        .send(crate::api::NotificationEvent::Error {
                            message: format!("Search failed: {e}"),
                        });
                }
            }
        });

        Ok(Json(ApiResponse::success(
            "Search for missing episodes triggered".to_string(),
        )))
    } else {
        let state_clone = state.clone();
        tokio::spawn(async move {
            perform_global_search(&state_clone).await;
        });

        Ok(Json(ApiResponse::success(
            "Global search triggered in background".to_string(),
        )))
    }
}

async fn perform_global_search(state: &AppState) {
    let start = std::time::Instant::now();
    tracing::info!(event = "global_search_started", "Starting global missing episode search");
    let _ = state.event_bus().send(crate::api::NotificationEvent::Info {
        message: "Starting global search for missing episodes".to_string(),
    });

    let missing_episodes = match state.store().get_all_missing_episodes(1000).await {
        Ok(eps) => eps,
        Err(e) => {
            tracing::error!(event = "global_search_failed", error = %e, "Failed to fetch missing episodes");
            return;
        }
    };

    if missing_episodes.is_empty() {
        tracing::info!(event = "global_search_finished", episodes_found = 0, duration_ms = u64::try_from(start.elapsed().as_millis()).unwrap_or(u64::MAX), "No missing episodes found");
        return;
    }

    let mut unique_anime_ids = std::collections::HashSet::new();
    for ep in &missing_episodes {
        unique_anime_ids.insert(i32::try_from(ep.anime_id).unwrap_or(i32::MAX));
    }

    tracing::debug!(
        episodes_found = missing_episodes.len(),
        series_count = unique_anime_ids.len(),
        "Found missing episodes"
    );

    let mut total_added = 0;
    for (idx, anime_id) in unique_anime_ids.iter().enumerate() {
        if idx > 0 {
            tokio::time::sleep(tokio::time::Duration::from_secs(10)).await;
        }

        let anime_title = match state.store().get_anime(*anime_id).await {
            Ok(Some(a)) => a.title.romaji,
            _ => format!("Anime #{anime_id}"),
        };

        tracing::debug!(
            anime_id = anime_id,
            anime_title = %anime_title,
            progress = format!("{}/{}", idx + 1, unique_anime_ids.len()),
            "Searching missing episodes for series"
        );

        let category = crate::clients::qbittorrent::sanitize_category(&anime_title);
        match perform_search_and_download(state, *anime_id, &category).await {
            Ok(count) => {
                total_added += i32::try_from(count).unwrap_or(i32::MAX);
                tracing::debug!(anime_title = %anime_title, count = count, "Added torrents");
            }
            Err(e) => {
                tracing::error!(anime_id = anime_id, error = %e, "Failed to search for anime");
            }
        }
    }

    tracing::info!(
        event = "global_search_finished",
        episodes_found = missing_episodes.len(),
        series_processed = unique_anime_ids.len(),
        torrents_added = total_added,
        duration_ms = u64::try_from(start.elapsed().as_millis()).unwrap_or(u64::MAX),
        "Global search complete"
    );

    let _ = state.event_bus().send(crate::api::NotificationEvent::Info {
        message: format!("Global search complete. Added {total_added} torrents."),
    });
}

async fn perform_search_and_download(
    state: &AppState,
    anime_id: i32,
    category: &str,
) -> anyhow::Result<usize> {
    let results = state.search_service().search_anime(anime_id).await?;
    let mut count = 0;

    for result in results {
        if result.download_action.should_download()
            && let Some(qbit) = &state.qbit()
        {
            if let Err(e) = qbit.add_magnet(&result.link, None, Some(category)).await {
                tracing::error!(anime_id = anime_id, error = %e, link = %result.link, "Failed to add torrent");
                continue;
            }

            if let Err(e) = state
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
                tracing::error!(anime_id = anime_id, error = %e, "Failed to record download");
            }

            count += 1;
        }
    }

    Ok(count)
}
