//! `SeaORM` implementation of the `ImportService` trait.

use crate::api::types::{SearchResultDto, TitleDto};
use crate::config::Config;
use crate::db::Store;
use crate::domain::AnimeId;
use crate::library::{LibraryService as LibraryScanner, RenamingOptions};
use crate::parser::filename::{detect_season_from_title, parse_filename};
use crate::services::MediaService;
use crate::services::import_service::{
    FailedImportDto, ImportError, ImportFileRequestDto, ImportOperationResult, ImportService,
    ImportedFileDto, MatchedAnimeDto, ScanResultDto, ScannedFileDto,
};
use async_trait::async_trait;
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tokio::sync::RwLock;

pub struct DefaultImportService {
    store: Store,
    config: Arc<RwLock<Config>>,
    library_scanner: Arc<crate::services::LibraryScannerService>,
    anilist: Arc<crate::clients::anilist::AnilistClient>,
    image_service: Arc<crate::services::ImageService>,
    metadata_service: Arc<crate::services::AnimeMetadataService>,
    event_bus: tokio::sync::broadcast::Sender<crate::api::NotificationEvent>,
    episodes_service: Arc<crate::services::episodes::EpisodeService>,
}

impl DefaultImportService {
    #[allow(clippy::too_many_arguments)]
    pub const fn new(
        store: Store,
        config: Arc<RwLock<Config>>,
        library_scanner: Arc<crate::services::LibraryScannerService>,
        anilist: Arc<crate::clients::anilist::AnilistClient>,
        image_service: Arc<crate::services::ImageService>,
        metadata_service: Arc<crate::services::AnimeMetadataService>,
        event_bus: tokio::sync::broadcast::Sender<crate::api::NotificationEvent>,
        episodes_service: Arc<crate::services::episodes::EpisodeService>,
    ) -> Self {
        Self {
            store,
            config,
            library_scanner,
            anilist,
            image_service,
            metadata_service,
            event_bus,
            episodes_service,
        }
    }

    async fn build_title_map(
        &self,
    ) -> Result<HashMap<String, crate::models::anime::Anime>, ImportError> {
        let monitored = self.store.list_monitored().await?;
        let mut title_map = HashMap::new();
        for anime in monitored {
            title_map.insert(anime.title.romaji.to_lowercase(), anime.clone());
            if let Some(ref en) = anime.title.english {
                title_map.insert(en.to_lowercase(), anime.clone());
            }
        }
        Ok(title_map)
    }

    async fn find_candidates(
        &self,
        scanned_files: &[ScannedFileDto],
        import_path: &Path,
        monitored_ids: &HashSet<i32>,
    ) -> Vec<SearchResultDto> {
        let mut candidates_map = HashMap::new();
        let mut search_queries = Vec::new();

        if let Some(folder_name) = import_path.file_name().and_then(|n| n.to_str()) {
            let clean_name = crate::parser::filename::clean_title(folder_name);
            if !clean_name.is_empty() {
                search_queries.push(clean_name);
            }
        }

        let mut season_aware_queries = HashSet::new();
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
            if let Ok(results) = self.anilist.search_anime(&query).await {
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

    fn suggest_candidates(scanned_files: &mut [ScannedFileDto], candidates: &[SearchResultDto]) {
        let mut candidate_seasons = HashMap::new();

        for candidate in candidates {
            let title_lower = candidate
                .title
                .english
                .as_deref()
                .or(Some(&candidate.title.romaji))
                .unwrap_or("")
                .to_lowercase();

            if let Some(s) = detect_season_from_title(&title_lower) {
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

    async fn resolve_anime_for_import(
        &self,
        anime_id: AnimeId,
        library_service: &LibraryScanner,
        library_path: &str,
    ) -> Result<crate::models::anime::Anime, ImportError> {
        if let Some(a) = self.store.get_anime(anime_id.value()).await? {
            return Ok(a);
        }

        let mut fetched_anime =
            self.anilist
                .get_by_id(anime_id.value())
                .await?
                .ok_or_else(|| {
                    ImportError::anilist_error(format!(
                        "Anime with ID {anime_id} not found on AniList"
                    ))
                })?;

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

        let formatted_path = library_service.format_path(&dummy_options);
        let path_buf = PathBuf::from(&formatted_path);

        let folder_name = if let Some(component) = path_buf.components().next() {
            component.as_os_str().to_string_lossy().to_string()
        } else if let Some(year) = fetched_anime.start_year {
            format!("{} ({})", fetched_anime.title.romaji, year)
        } else {
            fetched_anime.title.romaji.clone()
        };

        let sanitized_name = crate::clients::qbittorrent::sanitize_category(&folder_name);
        let root_path = Path::new(library_path)
            .join(&sanitized_name)
            .to_string_lossy()
            .to_string();

        fetched_anime.path = Some(root_path);
        fetched_anime.monitored = true;
        fetched_anime.added_at = chrono::Utc::now().to_rfc3339();

        self.metadata_service
            .enrich_anime_metadata(&mut fetched_anime)
            .await;

        if let Some(url) = &fetched_anime.cover_image
            && let Ok(path) = self
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
            && let Ok(path) = self
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

        self.store.add_anime(&fetched_anime).await?;
        Ok(fetched_anime)
    }
}

#[allow(clippy::too_many_lines)]
#[async_trait]
impl ImportService for DefaultImportService {
    async fn scan_path(
        &self,
        path: String,
        target_anime_id: Option<AnimeId>,
    ) -> Result<ScanResultDto, ImportError> {
        let import_path = PathBuf::from(&path);
        if !import_path.exists() {
            return Err(ImportError::PathNotFound(path));
        }

        let monitored = self.store.list_monitored().await?;
        let monitored_ids: HashSet<i32> = monitored.iter().map(|a| a.id).collect();
        let title_map = self.build_title_map().await?;

        let target_anime = if let Some(id) = target_anime_id {
            Some(
                self.store
                    .get_anime(id.value())
                    .await?
                    .ok_or(ImportError::AnimeNotFound(id))?,
            )
        } else {
            None
        };

        let video_extensions = crate::constants::VIDEO_EXTENSIONS;
        let scan_path_cloned = import_path.clone();

        // 🟢 Non-blocking scan using spawn_blocking
        let entries = tokio::task::spawn_blocking(move || {
            if scan_path_cloned.is_file() {
                vec![scan_path_cloned]
            } else {
                walkdir::WalkDir::new(&scan_path_cloned)
                    .follow_links(true)
                    .into_iter()
                    .filter_map(std::result::Result::ok)
                    .filter(|e| e.path().is_file())
                    .map(|e| e.path().to_path_buf())
                    .collect()
            }
        })
        .await
        .map_err(|e| ImportError::Internal(e.to_string()))?;

        let mut scanned_files = Vec::new();
        let library_scanner = &self.library_scanner;

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
                let title = Path::new(filename)
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
                    let (matched, _) = library_scanner.match_file_to_anime(
                        &file_path,
                        &release,
                        &title_map,
                        Some(&import_path),
                    );
                    matched.map(|a| MatchedAnimeDto {
                        id: a.id,
                        title: a.title.romaji,
                    })
                },
                |target| {
                    Some(MatchedAnimeDto {
                        id: target.id,
                        title: target.title.romaji.clone(),
                    })
                },
            );

            scanned_files.push(ScannedFileDto {
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

        scanned_files.sort_by(|a, b| {
            let season_a = a.season.unwrap_or(0);
            let season_b = b.season.unwrap_or(0);
            season_a
                .cmp(&season_b)
                .then_with(|| a.episode_number.total_cmp(&b.episode_number))
        });

        let candidates = self
            .find_candidates(&scanned_files, &import_path, &monitored_ids)
            .await;
        Self::suggest_candidates(&mut scanned_files, &candidates);

        Ok(ScanResultDto {
            files: scanned_files,
            skipped: Vec::new(),
            candidates,
        })
    }

    async fn import_file(
        &self,
        request: ImportFileRequestDto,
    ) -> Result<ImportedFileDto, ImportError> {
        let source_path = Path::new(&request.source_path);
        if !source_path.exists() {
            return Err(ImportError::PathNotFound(request.source_path));
        }

        let (library_scanner, library_path) = {
            let config = self.config.read().await;
            (
                LibraryScanner::new(config.library.clone()),
                config.library.library_path.clone(),
            )
        };

        let anime_id = AnimeId::new(request.anime_id);
        let anime = self
            .resolve_anime_for_import(anime_id, &library_scanner, &library_path)
            .await?;
        let episode = request.episode_number;
        let season = request.season.unwrap_or(1);

        let episode_title = self
            .episodes_service
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

        let media_service = MediaService::new();
        let media_info = media_service.get_media_info(source_path).await.ok();
        let parsed_filename = parse_filename(filename);
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

        let dest = library_scanner.get_destination_path(&options);
        library_scanner.import_file(source_path, &dest).await?;

        let file_size = tokio::fs::metadata(&dest)
            .await
            .map(|m| m.len().try_into().unwrap_or(i64::MAX))
            .ok();

        let quality_id = parsed_filename
            .as_ref()
            .map_or(1, crate::quality::determine_quality_id);

        self.store
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
            let _ = self
                .store
                .record_download(
                    anime.id,
                    filename,
                    rel.episode_number,
                    rel.group.as_deref(),
                    None,
                )
                .await;
        }

        Ok(ImportedFileDto {
            source_path: request.source_path.clone(),
            destination_path: dest.to_string_lossy().to_string(),
            anime_id: anime.id,
            episode_number: episode,
        })
    }

    async fn import_files(&self, requests: Vec<ImportFileRequestDto>) -> ImportOperationResult {
        let mut result = ImportOperationResult::default();
        let total_count = i32::try_from(requests.len()).unwrap_or(i32::MAX);

        let _ = self
            .event_bus
            .send(crate::api::NotificationEvent::ImportStarted { count: total_count });

        for file_request in requests {
            let source_path = file_request.source_path.clone();
            match self.import_file(file_request).await {
                Ok(imported) => {
                    result.imported += 1;
                    result.imported_files.push(imported);
                }
                Err(e) => {
                    result.failed += 1;
                    result.failed_files.push(FailedImportDto {
                        source_path,
                        error: e.to_string(),
                    });
                }
            }
        }

        let _ = self
            .event_bus
            .send(crate::api::NotificationEvent::ImportFinished {
                count: total_count,
                imported: i32::try_from(result.imported).unwrap_or(i32::MAX),
                failed: i32::try_from(result.failed).unwrap_or(i32::MAX),
            });

        result
    }
}
