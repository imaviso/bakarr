use axum::{
    Json,
    extract::{self, Query, State},
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tracing::info;
use url::Url;

use crate::clients::nyaa::{NyaaCategory, NyaaFilter};
use crate::clients::qbittorrent::AddTorrentOptions;
use crate::clients::qbittorrent::sanitize_category;
use crate::parser::filename::parse_filename;

use super::{ApiError, ApiResponse, AppState};

#[derive(Debug, Deserialize)]
pub struct SearchRequest {
    pub query: String,
    pub anime_id: Option<i32>,
    pub category: Option<String>,
    pub filter: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct DownloadRequest {
    pub anime_id: i32,
    pub magnet: String,
    pub episode_number: f32,
    pub group: Option<String>,
    pub title: String,
    pub info_hash: Option<String>,
    pub is_batch: Option<bool>,
}

#[derive(Debug, Serialize)]
pub struct SearchResults {
    pub results: Vec<NyaaSearchResult>,
    pub seadex_groups: Vec<String>,
}

#[derive(Debug, Serialize)]
#[allow(clippy::struct_excessive_bools)]
pub struct NyaaSearchResult {
    pub title: String,
    pub magnet: String,
    pub torrent_url: String,
    pub view_url: String,
    pub size: String,
    pub seeders: u32,
    pub leechers: u32,
    pub downloads: u32,
    pub pub_date: String,
    pub info_hash: String,
    pub trusted: bool,
    pub remake: bool,

    pub parsed_title: String,
    pub parsed_episode: Option<f32>,
    pub parsed_group: Option<String>,
    pub parsed_resolution: Option<String>,

    pub is_seadex: bool,
    pub is_seadex_best: bool,
}

pub async fn search_releases(
    State(state): State<Arc<AppState>>,
    Query(request): Query<SearchRequest>,
) -> Result<Json<ApiResponse<SearchResults>>, ApiError> {
    let category = match request.category.as_deref() {
        Some("anime_raw") => NyaaCategory::AnimeRaw,
        Some("anime_non_english") => NyaaCategory::AnimeNonEnglish,
        Some("all_anime") => NyaaCategory::AllAnime,
        _ => NyaaCategory::AnimeEnglish,
    };

    let filter = match request.filter.as_deref() {
        Some("trusted_only") => NyaaFilter::TrustedOnly,
        _ => NyaaFilter::NoRemakes,
    };

    let torrents = state
        .nyaa()
        .search(&request.query, category, filter)
        .await
        .map_err(|e| ApiError::internal(format!("Nyaa search failed: {e}")))?;

    let mut seadex_groups = Vec::new();
    let mut best_release_group = None;

    if let Some(anime_id) = request.anime_id
        && let Some(anime) = state.store().get_anime(anime_id).await?
    {
        let releases = state.shared.get_seadex_releases_cached(anime.id).await;
        if !releases.is_empty() {
            seadex_groups = releases.iter().map(|r| r.release_group.clone()).collect();
            best_release_group = releases.first().map(|r| r.release_group.clone());
        }
    }

    let results: Vec<NyaaSearchResult> = torrents
        .into_iter()
        .map(|t| {
            let parsed = parse_filename(&t.title);
            let parsed_group = parsed.as_ref().and_then(|p| p.group.clone());
            let is_seadex = parsed_group
                .as_ref()
                .is_some_and(|g| seadex_groups.contains(g));

            let is_seadex_best = parsed_group
                .as_ref()
                .is_some_and(|g| Some(g) == best_release_group.as_ref());

            NyaaSearchResult {
                magnet: t.magnet_link(),
                title: t.title,
                torrent_url: t.torrent_url,
                view_url: t.view_url,
                size: t.size,
                seeders: t.seeders,
                leechers: t.leechers,
                downloads: t.downloads,
                pub_date: t.pub_date,
                info_hash: t.info_hash,
                trusted: t.trusted,
                remake: t.remake,
                parsed_title: parsed.as_ref().map(|p| p.title.clone()).unwrap_or_default(),
                parsed_episode: parsed.as_ref().map(|p| p.episode_number),
                parsed_group,
                parsed_resolution: parsed.as_ref().and_then(|p| p.resolution.clone()),
                is_seadex,
                is_seadex_best,
            }
        })
        .collect();

    Ok(Json(ApiResponse::success(SearchResults {
        results,
        seadex_groups,
    })))
}

pub async fn search_episode(
    State(state): State<Arc<AppState>>,
    extract::Path((anime_id, episode_number)): extract::Path<(i32, i32)>,
) -> Result<Json<ApiResponse<Vec<crate::services::search::SearchResult>>>, ApiError> {
    let results = state
        .search_service()
        .search_episode(anime_id, episode_number)
        .await
        .map_err(|e| ApiError::internal(format!("Search failed: {e}")))?;

    Ok(Json(ApiResponse::success(results)))
}

pub async fn download_release(
    State(state): State<Arc<AppState>>,
    Json(request): Json<DownloadRequest>,
) -> Result<Json<ApiResponse<()>>, ApiError> {
    let qbit = state
        .qbit()
        .as_ref()
        .ok_or_else(|| ApiError::validation("Download client is not enabled".to_string()))?;

    let anime = state
        .store()
        .get_anime(request.anime_id)
        .await?
        .ok_or_else(|| ApiError::not_found("Anime", request.anime_id))?;

    let category = sanitize_category(&anime.title.romaji);

    let _ = qbit.create_category(&category, None).await;

    let options = AddTorrentOptions {
        category: Some(category.clone()),
        ..Default::default()
    };

    qbit.add_torrent_url(&request.magnet, Some(options))
        .await
        .map_err(|e| ApiError::internal(format!("Failed to add torrent: {e}")))?;

    let episode_number = if request.is_batch == Some(true) {
        0.0
    } else {
        request.episode_number
    };

    let info_hash = request
        .info_hash
        .clone()
        .or_else(|| extract_hash_from_magnet(&request.magnet));

    state
        .store()
        .record_download(
            anime.id,
            &request.title,
            episode_number,
            request.group.as_deref(),
            info_hash.as_deref(),
        )
        .await
        .map_err(|e| ApiError::internal(format!("Failed to record download: {e}")))?;

    info!(
        "Manually queued download for {}: {} (Ep {})",
        anime.title.romaji, request.title, episode_number
    );

    let _ = state
        .event_bus()
        .send(crate::api::NotificationEvent::DownloadStarted {
            title: request.title,
        });

    Ok(Json(ApiResponse::success(())))
}

fn extract_hash_from_magnet(magnet: &str) -> Option<String> {
    let url = Url::parse(magnet).ok()?;
    url.query_pairs()
        .find(|(k, _)| k == "xt")
        .and_then(|(_, v)| v.strip_prefix("urn:btih:").map(ToString::to_string))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_hash_from_magnet() {
        let magnet = "magnet:?xt=urn:btih:c12fe1c06bba254a9dc9f519b335aa7c1367a88a&dn=Test.File&tr=udp%3A%2F%2Ftracker.coppersurfer.tk%3A6969%2Fannounce";
        assert_eq!(
            extract_hash_from_magnet(magnet),
            Some("c12fe1c06bba254a9dc9f519b335aa7c1367a88a".to_string())
        );

        let magnet_no_hash = "magnet:?dn=Test.File";
        assert_eq!(extract_hash_from_magnet(magnet_no_hash), None);

        let invalid_url = "not a magnet link";
        assert_eq!(extract_hash_from_magnet(invalid_url), None);
    }
}
