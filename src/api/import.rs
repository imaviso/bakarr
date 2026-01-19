use axum::{Json, extract::Query, extract::State};
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tracing::{info, warn};

use super::{ApiError, ApiResponse, AppState, SearchResultDto, TitleDto};
use crate::library::{LibraryService, RenamingOptions};
use crate::parser::filename::parse_filename;
use crate::services::EpisodeService;

#[derive(Debug, Deserialize)]
pub struct BrowseRequest {
    #[serde(default)]
    pub path: String,
}

#[derive(Debug, Serialize)]
pub struct BrowseResult {
    pub current_path: String,

    pub parent_path: Option<String>,

    pub entries: Vec<BrowseEntry>,
}

#[derive(Debug, Serialize)]
pub struct BrowseEntry {
    pub name: String,

    pub path: String,

    pub is_directory: bool,

    pub size: Option<u64>,
}

#[derive(Debug, Deserialize)]
pub struct ScanRequest {
    pub path: String,

    pub anime_id: Option<i32>,
}

#[derive(Debug, Deserialize)]
pub struct ImportRequest {
    pub files: Vec<ImportFileRequest>,
}

#[derive(Debug, Deserialize)]
pub struct ImportFileRequest {
    pub source_path: String,

    pub anime_id: i32,

    pub episode_number: i32,

    pub season: Option<i32>,
}

#[derive(Debug, Serialize)]
pub struct ScanResult {
    pub files: Vec<ScannedFile>,

    pub skipped: Vec<SkippedFile>,

    pub candidates: Vec<SearchResultDto>,
}

#[derive(Debug, Serialize)]
pub struct ScannedFile {
    pub source_path: String,

    pub filename: String,

    pub parsed_title: String,

    pub episode_number: f32,

    pub season: Option<i32>,

    pub group: Option<String>,

    pub resolution: Option<String>,

    pub matched_anime: Option<MatchedAnime>,

    pub suggested_candidate_id: Option<i32>,
}

#[derive(Debug, Serialize)]
pub struct MatchedAnime {
    pub id: i32,
    pub title: String,
}

#[derive(Debug, Serialize)]
pub struct SkippedFile {
    pub path: String,
    pub reason: String,
}

#[derive(Debug, Serialize)]
pub struct ImportResultDto {
    pub imported: usize,

    pub failed: usize,

    pub imported_files: Vec<ImportedFile>,

    pub failed_files: Vec<FailedImport>,
}

#[derive(Debug, Serialize)]
pub struct ImportedFile {
    pub source_path: String,
    pub destination_path: String,
    pub anime_id: i32,
    pub episode_number: i32,
}

#[derive(Debug, Serialize)]
pub struct FailedImport {
    pub source_path: String,
    pub error: String,
}

pub async fn scan_path(
    State(state): State<Arc<AppState>>,
    Json(request): Json<ScanRequest>,
) -> Result<Json<ApiResponse<ScanResult>>, ApiError> {
    let import_path = Path::new(&request.path);

    let library = crate::services::LibraryScannerService::new(
        state.store.clone(),
        state.config.clone(),
        state.event_bus.clone(),
    );

    if !import_path.exists() {
        return Err(ApiError::validation(format!(
            "Path does not exist: {}",
            request.path
        )));
    }

    let video_extensions = ["mkv", "mp4", "avi", "webm", "m4v"];
    let mut scanned_files: Vec<ScannedFile> = Vec::new();
    let skipped_files: Vec<SkippedFile> = Vec::new();

    let monitored = state.store.list_monitored().await?;
    let monitored_ids: std::collections::HashSet<i32> = monitored.iter().map(|a| a.id).collect();

    let mut title_map: std::collections::HashMap<String, crate::models::anime::Anime> =
        std::collections::HashMap::new();
    for anime in &monitored {
        title_map.insert(anime.title.romaji.to_lowercase(), anime.clone());
        if let Some(ref en) = anime.title.english {
            title_map.insert(en.to_lowercase(), anime.clone());
        }
    }

    let target_anime = if let Some(id) = request.anime_id {
        match state.store.get_anime(id).await? {
            Some(a) => Some((a.id, a.title.romaji.clone())),
            None => {
                return Err(ApiError::not_found("Anime", id));
            }
        }
    } else {
        None
    };

    let entries: Vec<PathBuf> = if import_path.is_file() {
        vec![import_path.to_path_buf()]
    } else {
        walkdir::WalkDir::new(import_path)
            .follow_links(true)
            .into_iter()
            .filter_map(|e| e.ok())
            .filter(|e| e.path().is_file())
            .map(|e| e.path().to_path_buf())
            .collect()
    };

    for file_path in entries {
        let extension = file_path
            .extension()
            .and_then(|e| e.to_str())
            .map(|e| e.to_lowercase())
            .unwrap_or_default();

        if !video_extensions.contains(&extension.as_str()) {
            continue;
        }

        let filename = file_path.file_name().and_then(|n| n.to_str()).unwrap_or("");

        let release = match parse_filename(filename) {
            Some(r) => r,
            None => {
                let title = std::path::Path::new(filename)
                    .file_stem()
                    .and_then(|s| s.to_str())
                    .unwrap_or(filename)
                    .to_string();

                crate::models::release::Release {
                    original_filename: filename.to_string(),
                    title,
                    episode_number: 0.0,
                    season: Some(1),
                    group: None,
                    resolution: None,
                    source: None,
                    version: None,
                }
            }
        };

        let matched_anime = if let Some(ref target) = target_anime {
            Some(MatchedAnime {
                id: target.0,
                title: target.1.clone(),
            })
        } else {
            let (matched, _) =
                library.match_file_to_anime(&file_path, &release, &title_map, Some(import_path));
            matched.map(|a| MatchedAnime {
                id: a.id,
                title: a.title.romaji,
            })
        };

        scanned_files.push(ScannedFile {
            source_path: file_path.to_string_lossy().to_string(),
            filename: filename.to_string(),
            parsed_title: release.title.clone(),
            episode_number: release.episode_number,
            season: release.season,
            group: release.group,
            resolution: release.resolution,
            matched_anime,
            suggested_candidate_id: None,
        });
    }

    let mut candidates_map: std::collections::HashMap<i32, SearchResultDto> =
        std::collections::HashMap::new();
    let client = crate::clients::anilist::AnilistClient::new();

    let mut search_queries: Vec<String> = Vec::new();

    if let Some(folder_name) = import_path.file_name().and_then(|n| n.to_str()) {
        let clean_name = crate::parser::filename::clean_title(folder_name);
        if !clean_name.is_empty() {
            search_queries.push(clean_name);
        }
    }

    let mut season_aware_queries: std::collections::HashSet<String> =
        std::collections::HashSet::new();

    for file in &scanned_files {
        let normalized = crate::parser::filename::normalize_title(&file.parsed_title);
        if !normalized.is_empty() {
            season_aware_queries.insert(normalized.clone());

            if let Some(season) = file.season
                && season > 1
            {
                let season_query = format!("{} Season {}", normalized, season);
                season_aware_queries.insert(season_query);
            }
        }
    }

    for query in season_aware_queries {
        if !search_queries
            .iter()
            .any(|q| q.to_lowercase() == query.to_lowercase())
        {
            search_queries.push(query);
        }
    }

    for query in search_queries.into_iter().take(2) {
        if let Ok(results) = client.search_anime(&query).await {
            for anime in results {
                candidates_map
                    .entry(anime.id)
                    .or_insert_with(|| SearchResultDto {
                        id: anime.id,
                        title: TitleDto {
                            romaji: anime.title.romaji,
                            english: anime.title.english,
                            native: anime.title.native,
                        },
                        format: anime.format,
                        episode_count: anime.episode_count,
                        status: anime.status,
                        cover_image: anime.cover_image,
                        already_in_library: monitored_ids.contains(&anime.id),
                    });
            }
        }
    }

    let mut candidates: Vec<SearchResultDto> = candidates_map.into_values().collect();
    candidates.sort_by(|a, b| {
        b.already_in_library
            .cmp(&a.already_in_library)
            .then_with(|| a.id.cmp(&b.id))
    });

    let season_regex = Regex::new(r"(?i)(?:season\s+(\d+)|(\d+)(?:nd|rd|th)\s+season)").unwrap();
    let mut candidate_seasons: std::collections::HashMap<i32, i32> =
        std::collections::HashMap::new();

    for candidate in &candidates {
        let title_lower = candidate
            .title
            .english
            .as_deref()
            .or(Some(&candidate.title.romaji))
            .unwrap_or("")
            .to_lowercase();

        if let Some(caps) = season_regex.captures(&title_lower)
            && let Some(n) = caps.get(1).or(caps.get(2))
            && let Ok(s) = n.as_str().parse::<i32>()
        {
            candidate_seasons.insert(candidate.id, s);
        }

        candidate_seasons.entry(candidate.id).or_insert(1);
    }

    for file in &mut scanned_files {
        if file.matched_anime.is_some() {
            continue;
        }

        let file_season = file.season.unwrap_or(1);
        let mut best_match: Option<i32> = None;

        for candidate in &candidates {
            let cand_season = *candidate_seasons.get(&candidate.id).unwrap_or(&1);

            if cand_season > 1 {
                if file_season == cand_season {
                    best_match = Some(candidate.id);
                    break;
                }
            } else if best_match.is_none() {
                best_match = Some(candidate.id);
            }
        }

        file.suggested_candidate_id = best_match;
    }

    Ok(Json(ApiResponse::success(ScanResult {
        files: scanned_files,
        skipped: skipped_files,
        candidates,
    })))
}

pub async fn import_files(
    State(state): State<Arc<AppState>>,
    Json(request): Json<ImportRequest>,
) -> Result<Json<ApiResponse<ImportResultDto>>, ApiError> {
    let config = state.config.read().await;
    let library = LibraryService::new(config.library.clone());
    let episode_service = EpisodeService::new(state.store.clone());

    let mut imported_files: Vec<ImportedFile> = Vec::new();
    let mut failed_files: Vec<FailedImport> = Vec::new();

    let files_to_process = request.files;
    let total_count = files_to_process.len() as i32;

    let _ = state
        .event_bus
        .send(crate::api::NotificationEvent::ImportStarted { count: total_count });

    for file_request in files_to_process {
        let source_path = Path::new(&file_request.source_path);

        if !source_path.exists() {
            failed_files.push(FailedImport {
                source_path: file_request.source_path,
                error: "Source file does not exist".to_string(),
            });
            continue;
        }

        let anime = match state.store.get_anime(file_request.anime_id).await? {
            Some(a) => a,
            None => {
                let client = crate::clients::anilist::AnilistClient::new();
                match client.get_by_id(file_request.anime_id).await {
                    Ok(Some(mut fetched_anime)) => {
                        let dummy_options = crate::library::RenamingOptions {
                            anime: fetched_anime.clone(),
                            episode_number: 1,
                            season: Some(1),
                            episode_title: "Dummy".to_string(),
                            quality: None,
                            group: None,
                            original_filename: None,
                            extension: "mkv".to_string(),
                            year: fetched_anime.start_year,
                            media_info: None,
                        };

                        let formatted_path = library.format_path(&dummy_options);
                        let path_buf = std::path::PathBuf::from(&formatted_path);

                        let folder_name = if let Some(component) = path_buf.components().next() {
                            component.as_os_str().to_string_lossy().to_string()
                        } else if let Some(year) = fetched_anime.start_year {
                            format!("{} ({})", fetched_anime.title.romaji, year)
                        } else {
                            fetched_anime.title.romaji.clone()
                        };

                        let sanitized_name =
                            crate::clients::qbittorrent::sanitize_category(&folder_name);

                        let library_base = config.library.library_path.clone();
                        let root_path = std::path::Path::new(&library_base)
                            .join(&sanitized_name)
                            .to_string_lossy()
                            .to_string();

                        fetched_anime.path = Some(root_path);
                        fetched_anime.monitored = true;
                        fetched_anime.added_at = chrono::Utc::now().to_rfc3339();

                        state
                            .metadata_service
                            .enrich_anime_metadata(&mut fetched_anime)
                            .await;

                        if let Some(url) = &fetched_anime.cover_image
                            && let Ok(path) = state
                                .image_service
                                .save_image(
                                    url,
                                    fetched_anime.id,
                                    crate::services::image::ImageType::Cover,
                                )
                                .await
                        {
                            fetched_anime.cover_image = Some(path);
                        }
                        if let Some(url) = &fetched_anime.banner_image
                            && let Ok(path) = state
                                .image_service
                                .save_image(
                                    url,
                                    fetched_anime.id,
                                    crate::services::image::ImageType::Banner,
                                )
                                .await
                        {
                            fetched_anime.banner_image = Some(path);
                        }

                        if let Err(e) = state.store.add_anime(&fetched_anime).await {
                            failed_files.push(FailedImport {
                                source_path: file_request.source_path,
                                error: format!("Failed to add anime to library: {}", e),
                            });
                            continue;
                        }

                        fetched_anime
                    }
                    Ok(None) => {
                        failed_files.push(FailedImport {
                            source_path: file_request.source_path,
                            error: format!(
                                "Anime with ID {} not found on AniList",
                                file_request.anime_id
                            ),
                        });
                        continue;
                    }
                    Err(e) => {
                        failed_files.push(FailedImport {
                            source_path: file_request.source_path,
                            error: format!("Failed to fetch anime info: {}", e),
                        });
                        continue;
                    }
                }
            }
        };

        let episode = file_request.episode_number;
        let season = file_request.season.unwrap_or(1);

        let episode_title: String = episode_service
            .get_episode_title(anime.id, episode)
            .await
            .unwrap_or_else(|_| format!("Episode {}", episode));

        let filename = source_path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("");
        let quality = crate::quality::parse_quality_from_filename(filename).to_string();

        let extension = source_path
            .extension()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string();

        let media_service = crate::services::MediaService::new();
        let media_info = media_service.get_media_info(source_path).ok();

        let parsed_filename = crate::parser::filename::parse_filename(filename);
        let group = parsed_filename.as_ref().and_then(|r| r.group.clone());

        let options = RenamingOptions {
            anime: anime.clone(),
            episode_number: episode,
            season: Some(season),
            episode_title,
            quality: Some(quality),
            group,
            original_filename: Some(filename.to_string()),
            extension,
            year: anime.start_year,
            media_info: media_info.clone(),
        };

        let dest = library.get_destination_path(&options);

        match library.import_file(source_path, &dest).await {
            Ok(_) => {
                let file_size = tokio::fs::metadata(&dest)
                    .await
                    .map(|m| m.len() as i64)
                    .ok();

                let release = parse_filename(filename);
                let quality_id = release
                    .as_ref()
                    .map(crate::determine_quality_id)
                    .unwrap_or(1);

                if let Err(e) = state
                    .store
                    .mark_episode_downloaded(
                        anime.id,
                        episode,
                        season,
                        quality_id,
                        false,
                        dest.to_str().unwrap_or(""),
                        file_size,
                        media_info.as_ref(),
                    )
                    .await
                {
                    warn!("Failed to record episode in database: {}", e);
                }

                if let Some(rel) = release
                    && let Err(e) = state
                        .store
                        .record_download(
                            anime.id,
                            filename,
                            rel.episode_number,
                            rel.group.as_deref(),
                            None,
                        )
                        .await
                {
                    warn!("Failed to record download history: {}", e);
                }

                info!(
                    "Imported {} E{:02} -> {}",
                    anime.title.romaji,
                    episode,
                    dest.display()
                );

                imported_files.push(ImportedFile {
                    source_path: file_request.source_path,
                    destination_path: dest.to_string_lossy().to_string(),
                    anime_id: anime.id,
                    episode_number: episode,
                });
            }
            Err(e) => {
                warn!(
                    "Failed to import {} for {}: {}",
                    source_path.display(),
                    anime.title.romaji,
                    e
                );
                failed_files.push(FailedImport {
                    source_path: file_request.source_path,
                    error: e.to_string(),
                });
            }
        }
    }

    let _ = state
        .event_bus
        .send(crate::api::NotificationEvent::ImportFinished {
            count: total_count,
            imported: imported_files.len() as i32,
            failed: failed_files.len() as i32,
        });

    Ok(Json(ApiResponse::success(ImportResultDto {
        imported: imported_files.len(),
        failed: failed_files.len(),
        imported_files,
        failed_files,
    })))
}

pub async fn browse_path(
    Query(request): Query<BrowseRequest>,
) -> Result<Json<ApiResponse<BrowseResult>>, ApiError> {
    let path_str = request.path.trim();

    if path_str.is_empty() || path_str == "/" {
        let mut entries = Vec::new();

        let root_paths = ["/home", "/mnt", "/media", "/data", "/srv", "/tmp"];

        for root in root_paths {
            let path = Path::new(root);
            if path.exists() && path.is_dir() {
                entries.push(BrowseEntry {
                    name: root.to_string(),
                    path: root.to_string(),
                    is_directory: true,
                    size: None,
                });
            }
        }

        if let Ok(home) = std::env::var("HOME") {
            let home_path = Path::new(&home);
            if home_path.exists() && !entries.iter().any(|e| e.path == home) {
                entries.insert(
                    0,
                    BrowseEntry {
                        name: format!("~ ({})", home),
                        path: home,
                        is_directory: true,
                        size: None,
                    },
                );
            }
        }

        return Ok(Json(ApiResponse::success(BrowseResult {
            current_path: "/".to_string(),
            parent_path: None,
            entries,
        })));
    }

    let browse_path = Path::new(path_str);

    if !browse_path.exists() {
        return Err(ApiError::validation(format!(
            "Path does not exist: {}",
            path_str
        )));
    }

    if !browse_path.is_dir() {
        return Err(ApiError::validation(format!(
            "Path is not a directory: {}",
            path_str
        )));
    }

    let mut entries: Vec<BrowseEntry> = Vec::new();
    let video_extensions = ["mkv", "mp4", "avi", "webm", "m4v"];

    let mut dir_entries: Vec<_> = match std::fs::read_dir(browse_path) {
        Ok(entries) => entries.filter_map(|e| e.ok()).collect(),
        Err(e) => {
            return Err(ApiError::validation(format!(
                "Cannot read directory: {}",
                e
            )));
        }
    };

    dir_entries.sort_by(|a, b| {
        let a_is_dir = a.path().is_dir();
        let b_is_dir = b.path().is_dir();

        match (a_is_dir, b_is_dir) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => a.file_name().cmp(&b.file_name()),
        }
    });

    for entry in dir_entries {
        let entry_path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();

        if name.starts_with('.') {
            continue;
        }

        let is_directory = entry_path.is_dir();

        if !is_directory {
            let extension = entry_path
                .extension()
                .and_then(|e| e.to_str())
                .map(|e| e.to_lowercase())
                .unwrap_or_default();

            if !video_extensions.contains(&extension.as_str()) {
                continue;
            }
        }

        let size = if !is_directory {
            entry.metadata().ok().map(|m| m.len())
        } else {
            None
        };

        entries.push(BrowseEntry {
            name,
            path: entry_path.to_string_lossy().to_string(),
            is_directory,
            size,
        });
    }

    let parent_path = browse_path.parent().map(|p| {
        let parent_str = p.to_string_lossy().to_string();
        if parent_str.is_empty() {
            "/".to_string()
        } else {
            parent_str
        }
    });

    Ok(Json(ApiResponse::success(BrowseResult {
        current_path: path_str.to_string(),
        parent_path,
        entries,
    })))
}
