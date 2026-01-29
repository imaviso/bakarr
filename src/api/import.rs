use axum::{Json, extract::Query, extract::State};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::Arc;

use super::{ApiError, ApiResponse, AppState, SearchResultDto, TitleDto};
use crate::library::{LibraryService, RenamingOptions};
use crate::parser::filename::parse_filename;

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
    if !import_path.exists() {
        return Err(ApiError::validation(format!(
            "Path does not exist: {path}",
            path = request.path
        )));
    }

    let monitored = state.store().list_monitored().await?;
    let monitored_ids: std::collections::HashSet<i32> = monitored.iter().map(|a| a.id).collect();
    let title_map = build_title_map(&monitored);

    let target_anime = if let Some(id) = request.anime_id {
        Some(
            state
                .store()
                .get_anime(id)
                .await?
                .ok_or_else(|| ApiError::not_found("Anime", id))?,
        )
    } else {
        None
    };

    let mut scanned_files =
        collect_scanned_files(&state, import_path, &title_map, target_anime.as_ref());
    let candidates = find_candidates(
        &scanned_files,
        import_path,
        &monitored_ids,
        &state.shared.anilist,
    )
    .await;
    suggest_candidates(&mut scanned_files, &candidates);

    Ok(Json(ApiResponse::success(ScanResult {
        files: scanned_files,
        skipped: Vec::new(),
        candidates,
    })))
}

fn build_title_map(
    monitored: &[crate::models::anime::Anime],
) -> std::collections::HashMap<String, crate::models::anime::Anime> {
    let mut title_map = std::collections::HashMap::new();
    for anime in monitored {
        title_map.insert(anime.title.romaji.to_lowercase(), anime.clone());
        if let Some(ref en) = anime.title.english {
            title_map.insert(en.to_lowercase(), anime.clone());
        }
    }
    title_map
}

fn collect_scanned_files(
    state: &AppState,
    import_path: &Path,
    title_map: &std::collections::HashMap<String, crate::models::anime::Anime>,
    target_anime: Option<&crate::models::anime::Anime>,
) -> Vec<ScannedFile> {
    let video_extensions = crate::constants::VIDEO_EXTENSIONS;
    let mut scanned_files = Vec::new();
    let library = &state.library_scanner;

    let entries: Vec<PathBuf> = if import_path.is_file() {
        vec![import_path.to_path_buf()]
    } else {
        walkdir::WalkDir::new(import_path)
            .follow_links(true)
            .into_iter()
            .filter_map(std::result::Result::ok)
            .filter(|e| e.path().is_file())
            .map(|e| e.path().to_path_buf())
            .collect()
    };

    for file_path in entries {
        let extension = file_path
            .extension()
            .and_then(|e| e.to_str())
            .map(str::to_lowercase)
            .unwrap_or_default();

        if !video_extensions.contains(&extension.as_str()) {
            continue;
        }

        let filename = file_path.file_name().and_then(|n| n.to_str()).unwrap_or("");
        let release = parse_filename(filename).unwrap_or_else(|| {
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
        });

        let matched_anime = target_anime.as_ref().map_or_else(
            || {
                let (matched, _) =
                    library.match_file_to_anime(&file_path, &release, title_map, Some(import_path));
                matched.map(|a| MatchedAnime {
                    id: a.id,
                    title: a.title.romaji,
                })
            },
            |target| {
                Some(MatchedAnime {
                    id: target.id,
                    title: target.title.romaji.clone(),
                })
            },
        );

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
    scanned_files
}

async fn find_candidates(
    scanned_files: &[ScannedFile],
    import_path: &Path,
    monitored_ids: &std::collections::HashSet<i32>,
    client: &crate::clients::anilist::AnilistClient,
) -> Vec<SearchResultDto> {
    let mut candidates_map = std::collections::HashMap::new();
    let mut search_queries = Vec::new();

    if let Some(folder_name) = import_path.file_name().and_then(|n| n.to_str()) {
        let clean_name = crate::parser::filename::clean_title(folder_name);
        if !clean_name.is_empty() {
            search_queries.push(clean_name);
        }
    }

    let mut season_aware_queries = std::collections::HashSet::new();
    for file in scanned_files {
        let normalized = crate::parser::filename::normalize_title(&file.parsed_title);
        if !normalized.is_empty() {
            season_aware_queries.insert(normalized.clone());
            if let Some(season) = file.season
                && season > 1
            {
                season_aware_queries.insert(format!("{normalized} Season {season}"));
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
    candidates
}

fn suggest_candidates(scanned_files: &mut [ScannedFile], candidates: &[SearchResultDto]) {
    let mut candidate_seasons = std::collections::HashMap::new();

    for candidate in candidates {
        let title_lower = candidate
            .title
            .english
            .as_deref()
            .or(Some(&candidate.title.romaji))
            .unwrap_or("")
            .to_lowercase();

        if let Some(s) = crate::parser::filename::detect_season_from_title(&title_lower) {
            candidate_seasons.insert(candidate.id, s);
        }
        candidate_seasons.entry(candidate.id).or_insert(1);
    }

    for file in scanned_files {
        if file.matched_anime.is_some() {
            continue;
        }

        let file_season = file.season.unwrap_or(1);
        let mut best_match = None;

        for candidate in candidates {
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
}

pub async fn import_files(
    State(state): State<Arc<AppState>>,
    Json(request): Json<ImportRequest>,
) -> Result<Json<ApiResponse<ImportResultDto>>, ApiError> {
    let (library, library_path) = {
        let config = state.config().read().await;
        (
            LibraryService::new(config.library.clone()),
            config.library.library_path.clone(),
        )
    };

    let mut imported_files = Vec::new();
    let mut failed_files = Vec::new();

    let files_to_process = request.files;
    let total_count = i32::try_from(files_to_process.len()).unwrap_or(i32::MAX);

    let _ = state
        .event_bus()
        .send(crate::api::NotificationEvent::ImportStarted { count: total_count });

    for file_request in files_to_process {
        match import_single_file(&state, &library, &library_path, &file_request).await {
            Ok(imported) => imported_files.push(imported),
            Err(e) => failed_files.push(FailedImport {
                source_path: file_request.source_path,
                error: e.to_string(),
            }),
        }
    }

    let _ = state
        .event_bus()
        .send(crate::api::NotificationEvent::ImportFinished {
            count: total_count,
            imported: i32::try_from(imported_files.len()).unwrap_or(i32::MAX),
            failed: i32::try_from(failed_files.len()).unwrap_or(i32::MAX),
        });

    Ok(Json(ApiResponse::success(ImportResultDto {
        imported: imported_files.len(),
        failed: failed_files.len(),
        imported_files,
        failed_files,
    })))
}

async fn import_single_file(
    state: &AppState,
    library: &LibraryService,
    library_path: &str,
    request: &ImportFileRequest,
) -> anyhow::Result<ImportedFile> {
    let source_path = Path::new(&request.source_path);
    if !source_path.exists() {
        anyhow::bail!("Source file does not exist");
    }

    let anime = resolve_anime_for_import(state, library, library_path, request.anime_id).await?;
    let episode = request.episode_number;
    let season = request.season.unwrap_or(1);

    let episode_title = state
        .shared
        .episodes
        .get_episode_title(anime.id, episode)
        .await
        .unwrap_or_else(|_| format!("Episode {episode}"));

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
    let media_info = media_service.get_media_info(source_path).await.ok();
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
    library.import_file(source_path, &dest).await?;

    let file_size = tokio::fs::metadata(&dest)
        .await
        .map(|m| m.len().try_into().unwrap_or(i64::MAX))
        .ok();

    let quality_id = parsed_filename
        .as_ref()
        .map_or(1, crate::quality::determine_quality_id);

    state
        .store()
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
        .await?;

    if let Some(rel) = parsed_filename {
        let _ = state
            .store()
            .record_download(
                anime.id,
                filename,
                rel.episode_number,
                rel.group.as_deref(),
                None,
            )
            .await;
    }

    Ok(ImportedFile {
        source_path: request.source_path.clone(),
        destination_path: dest.to_string_lossy().to_string(),
        anime_id: anime.id,
        episode_number: episode,
    })
}

async fn resolve_anime_for_import(
    state: &AppState,
    library: &LibraryService,
    library_path: &str,
    anime_id: i32,
) -> anyhow::Result<crate::models::anime::Anime> {
    if let Some(a) = state.store().get_anime(anime_id).await? {
        return Ok(a);
    }

    let client = &state.shared.anilist;
    let mut fetched_anime = client
        .get_by_id(anime_id)
        .await?
        .ok_or_else(|| anyhow::anyhow!("Anime with ID {anime_id} not found on AniList"))?;

    let dummy_options = RenamingOptions {
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

    let sanitized_name = crate::clients::qbittorrent::sanitize_category(&folder_name);
    let root_path = std::path::Path::new(library_path)
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

    state.store().add_anime(&fetched_anime).await?;
    Ok(fetched_anime)
}

pub async fn browse_path(
    Query(request): Query<BrowseRequest>,
) -> Result<Json<ApiResponse<BrowseResult>>, ApiError> {
    let path_str = request.path.trim();

    if path_str.is_empty() || path_str == "/" {
        return Ok(Json(ApiResponse::success(browse_root())));
    }

    let browse_path = Path::new(path_str);
    if !browse_path.exists() || !browse_path.is_dir() {
        return Err(ApiError::validation(format!(
            "Path does not exist or is not a directory: {path_str}"
        )));
    }

    let mut entries = Vec::new();
    let video_extensions = crate::constants::VIDEO_EXTENSIONS;

    let mut dir_entries = tokio::fs::read_dir(browse_path)
        .await
        .map_err(|e| ApiError::validation(format!("Cannot read directory: {e}")))?;

    let mut all_entries = Vec::new();
    while let Ok(Some(entry)) = dir_entries.next_entry().await {
        all_entries.push(entry);
    }

    all_entries.sort_by(|a, b| match (a.path().is_dir(), b.path().is_dir()) {
        (true, false) => std::cmp::Ordering::Less,
        (false, true) => std::cmp::Ordering::Greater,
        _ => a.file_name().cmp(&b.file_name()),
    });

    for entry in all_entries {
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
                .map(str::to_lowercase)
                .unwrap_or_default();

            if !video_extensions.contains(&extension.as_str()) {
                continue;
            }
        }

        entries.push(BrowseEntry {
            name,
            path: entry_path.to_string_lossy().to_string(),
            is_directory,
            size: if is_directory {
                None
            } else {
                entry.metadata().await.ok().map(|m| m.len())
            },
        });
    }

    let parent_path = browse_path.parent().map(|p| {
        let p_str = p.to_string_lossy().to_string();
        if p_str.is_empty() {
            "/".to_string()
        } else {
            p_str
        }
    });

    Ok(Json(ApiResponse::success(BrowseResult {
        current_path: path_str.to_string(),
        parent_path,
        entries,
    })))
}

fn browse_root() -> BrowseResult {
    let mut entries = Vec::new();
    let root_paths = ["/home", "/mnt", "/media", "/data", "/srv", "/tmp"];

    for root in root_paths {
        if Path::new(root).exists() {
            entries.push(BrowseEntry {
                name: root.to_string(),
                path: root.to_string(),
                is_directory: true,
                size: None,
            });
        }
    }

    if let Ok(home) = std::env::var("HOME")
        && !entries.iter().any(|e| e.path == home)
    {
        entries.insert(
            0,
            BrowseEntry {
                name: format!("~ ({home})"),
                path: home,
                is_directory: true,
                size: None,
            },
        );
    }

    BrowseResult {
        current_path: "/".to_string(),
        parent_path: None,
        entries,
    }
}
