//! `SeaORM` implementation of the `EpisodeService` trait.
//!
//! This module provides the concrete implementation of [`EpisodeService`] using
//! `SeaORM` for database access. It handles metadata fetching, file scanning,
//! and episode management operations.
//!
//! # Principal Notes
//! - **DRY Compliance**: File scanning logic delegated to shared helpers in `library_service_impl`
//! - **N+1 Prevention**: Batch operations preferred over individual queries
//! - **Error Mapping**: `SeaORM` errors mapped to domain errors

use crate::api::types::{
    CalendarEventDto, CalendarEventProps, EpisodeDto, MissingEpisodeDto, ScanFolderResult,
    VideoFileDto,
};
use crate::clients::anilist::AnilistClient;
use crate::clients::jikan::JikanClient;
use crate::clients::kitsu::KitsuClient;
use crate::clients::offline_db::OfflineDatabase;
use crate::config::Config;
use crate::constants::VIDEO_EXTENSIONS;
use crate::db::Store;
use crate::domain::{AnimeId, EpisodeNumber};
use crate::library::RecycleBin;
use crate::models::episode::EpisodeInput;
use crate::parser::filename::parse_filename;
use crate::quality::parse_quality_from_filename;
use crate::services::MediaService;
use crate::services::episode_service::{EpisodeError, EpisodeService};
use crate::services::provenance::{EpisodeProvenance, MetadataProvider};

use crate::services::image::{ImageService, ImageType};
use std::collections::{HashMap, HashSet, VecDeque};
use std::path::Path;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::RwLock;
use tracing::{debug, info, warn};

/// SeaORM-based implementation of [`EpisodeService`].
///
/// This implementation:
/// - Parallelizes independent database queries for better performance
/// - Handles file I/O asynchronously using tokio
/// - Maps `SeaORM` errors to domain errors
/// - Provides clean separation between domain and infrastructure
pub struct SeaOrmEpisodeService {
    store: Arc<Store>,
    anilist: Arc<AnilistClient>,
    jikan: Arc<JikanClient>,
    kitsu: Arc<KitsuClient>,
    offline_db: OfflineDatabase,
    image_service: Arc<ImageService>,
    config: Arc<RwLock<Config>>,
    event_bus: tokio::sync::broadcast::Sender<crate::domain::events::NotificationEvent>,
    recent_fetches: Arc<std::sync::RwLock<HashMap<i32, Instant>>>,
}

impl SeaOrmEpisodeService {
    /// Creates a new instance of the service.
    #[must_use]
    pub fn new(
        store: Arc<Store>,
        anilist: Arc<AnilistClient>,
        jikan: Arc<JikanClient>,
        kitsu: Option<Arc<KitsuClient>>,
        image_service: Arc<ImageService>,
        config: Arc<RwLock<Config>>,
        event_bus: tokio::sync::broadcast::Sender<crate::domain::events::NotificationEvent>,
    ) -> Self {
        Self {
            store: store.clone(),
            anilist,
            jikan,
            kitsu: kitsu.unwrap_or_else(|| Arc::new(KitsuClient::new())),
            offline_db: OfflineDatabase::new(Arc::unwrap_or_clone(store)),
            image_service,
            config,
            event_bus,
            recent_fetches: Arc::new(std::sync::RwLock::new(HashMap::new())),
        }
    }

    /// Gets the MAL ID from `AniList` ID using offline database.
    async fn get_mal_id(&self, anilist_id: i32) -> Option<i32> {
        self.offline_db
            .anilist_to_mal(anilist_id)
            .await
            .ok()
            .flatten()
    }

    /// Gets the Kitsu ID from `AniList` ID.
    ///
    /// First tries the offline database, then falls back to the Kitsu API
    /// mappings endpoint if not found locally.
    async fn get_kitsu_id(&self, anilist_id: i32) -> Option<i32> {
        // First try offline database
        if let Ok(Some(kitsu_id)) = self.offline_db.anilist_to_kitsu(anilist_id).await {
            return Some(kitsu_id);
        }

        // Fall back to Kitsu API
        match self.kitsu.lookup_kitsu_id_by_anilist(anilist_id).await {
            Ok(Some(kitsu_id)) => Some(kitsu_id),
            Ok(None) => {
                tracing::debug!(anilist_id, "Kitsu API returned no mapping");
                None
            }
            Err(e) => {
                tracing::warn!(anilist_id, error = %e, "Failed to lookup Kitsu ID via API");
                None
            }
        }
    }

    /// Fetches episodes from `AniList`.
    async fn fetch_from_anilist(&self, anilist_id: i32) -> anyhow::Result<Vec<EpisodeInput>> {
        let anilist_eps = self.anilist.get_episodes(anilist_id).await?;
        if anilist_eps.is_empty() {
            return Ok(Vec::new());
        }

        let mut all_episodes = Vec::new();
        let mut seen_episodes = HashSet::new();

        for ep in anilist_eps {
            if let Some(title) = ep.title
                && let Some(release) = parse_filename(&title)
                && release.episode_number > 0.0
                && !seen_episodes.contains(&release.episode_number_truncated())
            {
                let ep_num = release.episode_number_truncated();
                seen_episodes.insert(ep_num);

                // Track provenance
                let mut provenance = EpisodeProvenance::new();
                provenance.record_title(MetadataProvider::Anilist);
                if ep.aired.is_some() {
                    provenance.record_aired(MetadataProvider::Anilist);
                }

                all_episodes.push(EpisodeInput {
                    episode_number: ep_num,
                    title: Some(release.title),
                    title_japanese: None,
                    aired: ep.aired.clone(),
                    filler: false,
                    recap: false,
                    metadata_provenance: provenance.to_json(),
                });
            }
        }
        Ok(all_episodes)
    }

    /// Fetches episodes from Kitsu.
    async fn fetch_from_kitsu(&self, anilist_id: i32) -> anyhow::Result<Vec<EpisodeInput>> {
        let Some(kitsu_id) = self.get_kitsu_id(anilist_id).await else {
            return Ok(Vec::new());
        };

        let kitsu_eps = self.kitsu.get_episodes(kitsu_id).await?;
        if kitsu_eps.is_empty() {
            return Ok(Vec::new());
        }

        let mut all_episodes = Vec::new();
        let mut seen_episodes = HashSet::new();

        for ep in kitsu_eps {
            if let Some(num) = ep.attributes.number
                && num > 0
                && !seen_episodes.contains(&num)
            {
                seen_episodes.insert(num);

                // Track provenance
                let mut provenance = EpisodeProvenance::new();
                provenance.record_title(MetadataProvider::Kitsu);
                if ep.attributes.airdate.is_some() {
                    provenance.record_aired(MetadataProvider::Kitsu);
                }

                all_episodes.push(EpisodeInput {
                    episode_number: num,
                    title: ep.attributes.canonical_title,
                    title_japanese: None,
                    aired: ep.attributes.airdate,
                    filler: false,
                    recap: false,
                    metadata_provenance: provenance.to_json(),
                });
            }
        }
        Ok(all_episodes)
    }

    /// Fetches episodes from Jikan.
    async fn fetch_from_jikan(&self, anilist_id: i32) -> anyhow::Result<Vec<EpisodeInput>> {
        let Some(mal_id) = self.get_mal_id(anilist_id).await else {
            return Ok(Vec::new());
        };

        let mut all_episodes = Vec::new();
        let mut page = 1;

        loop {
            if page > 1 {
                tokio::time::sleep(Duration::from_millis(350)).await;
            }

            match self.jikan.get_episodes(mal_id, page).await {
                Ok(episodes) => {
                    if episodes.is_empty() {
                        break;
                    }

                    let count = episodes.len();
                    for ep in episodes {
                        // Track provenance
                        let mut provenance = EpisodeProvenance::new();
                        provenance.record_title(MetadataProvider::Jikan);
                        if ep.title_japanese.is_some() {
                            provenance.record_title_japanese(MetadataProvider::Jikan);
                        }
                        if ep.aired.is_some() {
                            provenance.record_aired(MetadataProvider::Jikan);
                        }
                        if ep.filler {
                            provenance.record_filler(MetadataProvider::Jikan);
                        }
                        if ep.recap {
                            provenance.record_recap(MetadataProvider::Jikan);
                        }

                        all_episodes.push(EpisodeInput {
                            episode_number: ep.mal_id,
                            title: ep.title,
                            title_japanese: ep.title_japanese,
                            aired: ep.aired,
                            filler: ep.filler,
                            recap: ep.recap,
                            metadata_provenance: provenance.to_json(),
                        });
                    }

                    if count < 100 {
                        break;
                    }
                    page += 1;

                    if page > 10 {
                        warn!(anilist_id, "Reached episode fetch limit for anime");
                        break;
                    }
                }
                Err(e) => {
                    warn!(
                        page,
                        mal_id,
                        error = %e,
                        "Failed to fetch episodes page"
                    );
                    break;
                }
            }
        }
        Ok(all_episodes)
    }

    /// Fetches and caches episodes from external sources.
    async fn fetch_and_cache_episodes(&self, anilist_id: i32) -> anyhow::Result<usize> {
        // Check recent fetches to avoid hammering APIs
        if let Ok(guard) = self.recent_fetches.read()
            && let Some(&last_fetch) = guard.get(&anilist_id)
            && last_fetch.elapsed() < Duration::from_secs(300)
        {
            debug!(
                "Skipping fetch for anime {} due to recent attempt",
                anilist_id
            );
            return Ok(0);
        }

        if let Ok(mut guard) = self.recent_fetches.write() {
            guard.insert(anilist_id, Instant::now());
        }

        // Try AniList first
        match self.fetch_from_anilist(anilist_id).await {
            Ok(eps) if !eps.is_empty() => {
                let count = eps.len();
                self.store.cache_episodes(anilist_id, &eps).await?;
                info!(
                    "Cached {} episodes from AniList for ID {}",
                    count, anilist_id
                );
                return Ok(count);
            }
            Ok(_) => debug!("AniList returned 0 episodes for ID {}", anilist_id),
            Err(e) => warn!(anilist_id, error = %e, "Failed to fetch from AniList"),
        }

        // Try Kitsu second
        match self.fetch_from_kitsu(anilist_id).await {
            Ok(eps) if !eps.is_empty() => {
                let count = eps.len();
                self.store.cache_episodes(anilist_id, &eps).await?;
                info!("Cached {} episodes from Kitsu for ID {}", count, anilist_id);
                return Ok(count);
            }
            Ok(_) => debug!("Kitsu returned 0 episodes for ID {}", anilist_id),
            Err(e) => warn!(anilist_id, error = %e, "Failed to fetch from Kitsu"),
        }

        // Try Jikan last
        match self.fetch_from_jikan(anilist_id).await {
            Ok(eps) if !eps.is_empty() => {
                let count = eps.len();
                self.store.cache_episodes(anilist_id, &eps).await?;
                info!("Cached {} episodes from Jikan for ID {}", count, anilist_id);
                return Ok(count);
            }
            Ok(_) => debug!("Jikan returned 0 episodes for ID {}", anilist_id),
            Err(e) => warn!(anilist_id, error = %e, "Failed to fetch from Jikan"),
        }

        Ok(0)
    }

    /// Collects all video files from a folder (for listing purposes).
    ///
    /// Unlike `collect_and_parse_episodes`, this returns ALL video files
    /// regardless of whether they can be parsed.
    async fn collect_video_files(
        &self,
        folder_path: &Path,
    ) -> Result<Vec<VideoFileDto>, EpisodeError> {
        let mut files = Vec::new();
        let mut dirs_to_visit = VecDeque::new();
        dirs_to_visit.push_back(folder_path.to_path_buf());

        let mut visited = HashSet::new();

        while let Some(current_dir) = dirs_to_visit.pop_front() {
            if !visited.insert(current_dir.clone()) {
                continue;
            }

            let mut entries = match tokio::fs::read_dir(&current_dir).await {
                Ok(e) => e,
                Err(e) => {
                    warn!(path = ?current_dir, error = %e, "Failed to read dir");
                    continue;
                }
            };

            while let Ok(Some(entry)) = entries.next_entry().await {
                let entry_path = entry.path();
                if entry_path.is_dir() {
                    if let Some(name) = entry_path.file_name().and_then(|n| n.to_str())
                        && !name.starts_with('.')
                    {
                        dirs_to_visit.push_back(entry_path);
                    }
                } else if let Some(ext) = entry_path.extension() {
                    let ext_str = ext.to_string_lossy().to_lowercase();
                    if VIDEO_EXTENSIONS.contains(&ext_str.as_str()) {
                        let path_str = entry_path.to_string_lossy().to_string();
                        let name = entry_path
                            .file_name()
                            .unwrap_or_default()
                            .to_string_lossy()
                            .to_string();
                        let size = tokio::fs::metadata(&entry_path)
                            .await
                            .map(|m| i64::try_from(m.len()).unwrap_or(i64::MAX))
                            .unwrap_or(0);

                        files.push(VideoFileDto {
                            name,
                            path: path_str,
                            size,
                            episode_number: None,
                        });
                    }
                }
            }
        }
        Ok(files)
    }

    /// Saves anime images (cover and banner).
    async fn save_anime_images(&self, anime: &mut crate::models::anime::Anime) {
        if let Some(url) = &anime.cover_image {
            match self
                .image_service
                .save_image(url, anime.id, ImageType::Cover)
                .await
            {
                Ok(path) => anime.cover_image = Some(path),
                Err(e) => warn!(error = %e, "Failed to save cover image"),
            }
        }

        if let Some(url) = &anime.banner_image {
            match self
                .image_service
                .save_image(url, anime.id, ImageType::Banner)
                .await
            {
                Ok(path) => anime.banner_image = Some(path),
                Err(e) => warn!(error = %e, "Failed to save banner image"),
            }
        }
    }
}

#[async_trait::async_trait]
impl EpisodeService for SeaOrmEpisodeService {
    async fn list_episodes(&self, anime_id: AnimeId) -> Result<Vec<EpisodeDto>, EpisodeError> {
        let id = anime_id.value();

        // Verify anime exists
        let anime = self
            .store
            .get_anime(id)
            .await
            .map_err(EpisodeError::from)?
            .ok_or(EpisodeError::AnimeNotFound(anime_id))?;

        let episode_count = anime.episode_count.unwrap_or(1);

        // Get episode statuses
        let downloaded_eps = self
            .store
            .get_episode_statuses(id)
            .await
            .map_err(EpisodeError::from)?;

        let max_downloaded = downloaded_eps
            .iter()
            .map(|e| e.episode_number)
            .max()
            .unwrap_or(0);
        let total_eps = std::cmp::max(episode_count, max_downloaded);

        // Determine start episode
        let start_ep = if downloaded_eps.iter().any(|e| e.episode_number == 0) {
            0
        } else {
            match self.store.get_episode_metadata(id, 0).await {
                Ok(Some(_)) => 0,
                _ => 1,
            }
        };

        // Get metadata
        let metadata_list = self
            .store
            .get_episodes_for_anime(id)
            .await
            .map_err(EpisodeError::from)?;

        // Trigger background metadata fetch if needed
        if metadata_list.is_empty() && anime.status == "RELEASING" {
            let svc = self.clone();
            tokio::spawn(async move {
                if let Err(e) = svc.fetch_and_cache_episodes(id).await {
                    warn!(error = %e, "Background metadata sync failed");
                }
            });
        }

        let metadata_map: HashMap<_, _> = metadata_list
            .into_iter()
            .map(|m| (m.episode_number, m))
            .collect();

        // Build episode DTOs
        let mut episodes = Vec::new();
        let mut stale_episodes: Vec<i32> = Vec::new();

        for ep_num in start_ep..=total_eps {
            let metadata = metadata_map.get(&ep_num).cloned();

            let status = downloaded_eps.iter().find(|s| s.episode_number == ep_num);

            // Check if file exists on disk
            let (downloaded, file_path) = if let Some(s) = status
                && let Some(ref path_str) = s.file_path
            {
                let path = Path::new(path_str);
                if path.exists() {
                    (true, Some(path_str.clone()))
                } else {
                    warn!(
                        episode = ep_num,
                        path = %path_str,
                        "File missing from disk"
                    );
                    stale_episodes.push(ep_num);
                    (false, None)
                }
            } else {
                (false, None)
            };

            episodes.push(EpisodeDto {
                number: ep_num,
                title: metadata.as_ref().and_then(|m| m.title.clone()),
                aired: metadata.as_ref().and_then(|m| m.aired.clone()),
                downloaded,
                file_path,
            });
        }

        // Clear stale episodes in background
        if !stale_episodes.is_empty() {
            let store = self.store.clone();
            let anime_id_val = id;
            tokio::spawn(async move {
                for ep_num in stale_episodes {
                    if let Err(e) = store.clear_episode_download(anime_id_val, ep_num).await {
                        tracing::error!(episode = ep_num, error = %e, "Failed to clear stale episode");
                    }
                }
            });
        }

        Ok(episodes)
    }

    async fn get_episode(
        &self,
        anime_id: AnimeId,
        episode_number: EpisodeNumber,
    ) -> Result<EpisodeDto, EpisodeError> {
        let id = anime_id.value();
        let number = episode_number.as_i32().ok_or_else(|| {
            EpisodeError::Validation("Fractional episode numbers not supported".to_string())
        })?;

        // Verify anime exists
        let _anime = self
            .store
            .get_anime(id)
            .await
            .map_err(EpisodeError::from)?
            .ok_or(EpisodeError::AnimeNotFound(anime_id))?;

        // Get metadata
        let metadata = self
            .store
            .get_episode_metadata(id, number)
            .await
            .map_err(EpisodeError::from)?
            .ok_or(EpisodeError::NotFound(episode_number))?;

        // Get status
        let status = self
            .store
            .get_episode_statuses(id)
            .await
            .map_err(EpisodeError::from)?
            .into_iter()
            .find(|s| s.episode_number == number);

        // Check if file exists
        let (downloaded, file_path) = if let Some(ref s) = status
            && let Some(ref path_str) = s.file_path
        {
            let path = Path::new(path_str);
            if path.exists() {
                (true, Some(path_str.clone()))
            } else {
                // Clear stale entry in background
                let store = self.store.clone();
                let anime_id_val = id;
                let ep_num = number;
                tokio::spawn(async move {
                    let _ = store.clear_episode_download(anime_id_val, ep_num).await;
                });
                (false, None)
            }
        } else {
            (false, None)
        };

        Ok(EpisodeDto {
            number,
            title: metadata.title,
            aired: metadata.aired,
            downloaded,
            file_path,
        })
    }

    async fn get_missing_episodes(&self, anime_id: AnimeId) -> Result<Vec<i32>, EpisodeError> {
        let id = anime_id.value();

        // Verify anime exists
        let _anime = self
            .store
            .get_anime(id)
            .await
            .map_err(EpisodeError::from)?
            .ok_or(EpisodeError::AnimeNotFound(anime_id))?;

        let missing = self
            .store
            .get_missing_episode_numbers_for_anime(id)
            .await
            .map_err(EpisodeError::from)?;

        Ok(missing)
    }

    async fn scan_folder(&self, anime_id: AnimeId) -> Result<ScanFolderResult, EpisodeError> {
        let id = anime_id.value();

        // Get anime info
        let anime = self
            .store
            .get_anime(id)
            .await
            .map_err(EpisodeError::from)?
            .ok_or(EpisodeError::AnimeNotFound(anime_id))?;

        let folder_path = anime
            .path
            .ok_or_else(|| EpisodeError::Validation("Anime has no root folder set".to_string()))?;

        let path = Path::new(&folder_path);
        if !path.exists() {
            return Err(EpisodeError::Validation(format!(
                "Folder does not exist: {folder_path}"
            )));
        }

        info!(anime_id = id, path = ?path, "Scanning folder");

        // Delegate to shared scanner (DRY: avoids code duplication)
        // This helper handles file discovery, parsing, marking downloads, and events
        let found =
            crate::services::scan_folder_for_episodes(&self.store, &self.event_bus, id, path)
                .await?;

        // Get total count after scanning
        let after_count = self
            .store
            .get_downloaded_count(id)
            .await
            .map_err(EpisodeError::from)?;

        info!(
            event = "folder_scan_finished",
            found = found,
            total = after_count,
            "Folder scan complete"
        );

        Ok(ScanFolderResult {
            found,
            total: after_count,
        })
    }

    async fn list_files(&self, anime_id: AnimeId) -> Result<Vec<VideoFileDto>, EpisodeError> {
        let id = anime_id.value();

        // Get anime info
        let anime = self
            .store
            .get_anime(id)
            .await
            .map_err(EpisodeError::from)?
            .ok_or(EpisodeError::AnimeNotFound(anime_id))?;

        let folder_path = anime
            .path
            .ok_or_else(|| EpisodeError::Validation("Anime has no root folder set".to_string()))?;

        let path = Path::new(&folder_path);
        if !path.exists() {
            return Err(EpisodeError::Validation(format!(
                "Folder does not exist: {folder_path}"
            )));
        }

        // Get episode statuses to map files to episodes
        let statuses = self
            .store
            .get_episode_statuses(id)
            .await
            .map_err(EpisodeError::from)?;
        let mapped_paths: HashMap<String, i32> = statuses
            .into_iter()
            .filter_map(|s| s.file_path.map(|p| (p, s.episode_number)))
            .collect();

        // Collect video files
        let mut files = self.collect_video_files(path).await?;

        // Map files to episodes
        for file in &mut files {
            file.episode_number = mapped_paths.get(&file.path).copied();
        }

        // Add missing mapped files
        let scanned_paths: HashSet<String> = files.iter().map(|f| f.path.clone()).collect();

        for (path_str, ep_num) in &mapped_paths {
            if !scanned_paths.contains(path_str) {
                let file_path = Path::new(path_str);
                if file_path.exists() {
                    let name = file_path
                        .file_name()
                        .unwrap_or_default()
                        .to_string_lossy()
                        .to_string();
                    let size = tokio::fs::metadata(file_path)
                        .await
                        .map(|m| i64::try_from(m.len()).unwrap_or(i64::MAX))
                        .unwrap_or(0);

                    files.push(VideoFileDto {
                        name,
                        path: path_str.clone(),
                        size,
                        episode_number: Some(*ep_num),
                    });
                } else {
                    warn!(path = %path_str, "Mapped file missing from disk");
                }
            }
        }

        files.sort_by(|a, b| a.name.cmp(&b.name));
        Ok(files)
    }

    async fn map_file(
        &self,
        anime_id: AnimeId,
        episode_number: EpisodeNumber,
        file_path: String,
    ) -> Result<(), EpisodeError> {
        let id = anime_id.value();
        let number = episode_number.as_i32().ok_or_else(|| {
            EpisodeError::Validation("Fractional episode numbers not supported".to_string())
        })?;

        if number <= 0 {
            return Err(EpisodeError::Validation(
                "Episode number must be positive".to_string(),
            ));
        }

        // Verify anime exists
        let _anime = self
            .store
            .get_anime(id)
            .await
            .map_err(EpisodeError::from)?
            .ok_or(EpisodeError::AnimeNotFound(anime_id))?;

        // Check if file exists
        let path = Path::new(&file_path);
        if !path.exists() {
            return Err(EpisodeError::NotFound(episode_number));
        }

        // Get file metadata
        let file_size = tokio::fs::metadata(path)
            .await
            .map(|m| i64::try_from(m.len()).unwrap_or(i64::MAX))
            .ok();

        // Parse media info
        let media_service = MediaService::new();
        let media_info = media_service.get_media_info(path).await.ok();

        // Parse quality from filename
        let filename = path.file_name().unwrap_or_default().to_string_lossy();
        let quality = parse_quality_from_filename(&filename);

        // Get existing season
        let existing_status = self
            .store
            .get_episode_status(id, number)
            .await
            .map_err(EpisodeError::from)?;
        let season = existing_status.map_or(1, |s| s.season);

        // Mark as downloaded
        self.store
            .mark_episode_downloaded(
                id,
                number,
                season,
                quality.id,
                false,
                &file_path,
                file_size,
                media_info.as_ref(),
            )
            .await
            .map_err(EpisodeError::from)?;

        Ok(())
    }

    async fn bulk_map_files(
        &self,
        anime_id: AnimeId,
        mappings: Vec<(EpisodeNumber, String)>,
    ) -> Result<(), EpisodeError> {
        for (number, path) in mappings {
            if let Err(e) = self.map_file(anime_id, number, path).await {
                warn!(error = %e, "Failed to map episode");
            }
        }
        Ok(())
    }

    async fn delete_file(
        &self,
        anime_id: AnimeId,
        episode_number: EpisodeNumber,
    ) -> Result<(), EpisodeError> {
        let id = anime_id.value();
        let number = episode_number.as_i32().ok_or_else(|| {
            EpisodeError::Validation("Fractional episode numbers not supported".to_string())
        })?;

        // Verify anime exists
        let _anime = self
            .store
            .get_anime(id)
            .await
            .map_err(EpisodeError::from)?
            .ok_or(EpisodeError::AnimeNotFound(anime_id))?;

        // Get episode status
        let status = self
            .store
            .get_episode_status(id, number)
            .await
            .map_err(EpisodeError::from)?
            .ok_or(EpisodeError::NotFound(episode_number))?;

        if let Some(ref path_str) = status.file_path {
            let path = Path::new(path_str);

            if path.exists() {
                // Move to recycle bin
                let config = self.config.read().await;
                let recycle_path = config.library.recycle_path.clone();
                let cleanup_days = config.library.recycle_cleanup_days;
                drop(config);

                let recycle_bin = RecycleBin::new(recycle_path, cleanup_days);

                match recycle_bin.recycle(path, "User triggered delete").await {
                    Ok(recycled_file) => {
                        self.store
                            .add_to_recycle_bin(
                                path_str,
                                Some(recycled_file.recycled_path.to_str().unwrap_or_default()),
                                id,
                                number,
                                status.quality_id,
                                status.file_size,
                                "User triggered delete",
                            )
                            .await
                            .map_err(EpisodeError::from)?;
                    }
                    Err(e) => {
                        tracing::error!(error = %e, "Failed to recycle file");
                        tokio::fs::remove_file(path).await.map_err(|e| {
                            EpisodeError::FileSystem(std::io::Error::other(format!(
                                "Failed to delete file: {e}"
                            )))
                        })?;
                    }
                }
            }

            // Clear episode download status
            self.store
                .clear_episode_download(id, number)
                .await
                .map_err(EpisodeError::from)?;
        } else {
            return Err(EpisodeError::Validation(
                "No file associated with this episode".to_string(),
            ));
        }

        Ok(())
    }

    async fn refresh_metadata(&self, anime_id: AnimeId) -> Result<usize, EpisodeError> {
        let id = anime_id.value();

        // Get anime info
        let initial_title =
            if let Some(a) = self.store.get_anime(id).await.map_err(EpisodeError::from)? {
                a.title.romaji
            } else {
                format!("Anime #{id}")
            };

        // Send refresh started event
        let _ = self
            .event_bus
            .send(crate::domain::events::NotificationEvent::RefreshStarted {
                anime_id: id,
                title: initial_title,
            });

        // Fetch updated anime info from AniList
        if let Some(mut anime) =
            self.anilist
                .get_by_id(id)
                .await
                .map_err(|e| EpisodeError::ExternalApi {
                    service: "AniList".to_string(),
                    message: e.to_string(),
                })?
        {
            // Preserve existing settings
            if let Some(existing) = self.store.get_anime(id).await.map_err(EpisodeError::from)? {
                anime.quality_profile_id = existing.quality_profile_id;
                anime.path = existing.path;
                anime.monitored = existing.monitored;
            }

            // Save images
            self.save_anime_images(&mut anime).await;

            // Save updated anime
            self.store
                .add_anime(&anime)
                .await
                .map_err(EpisodeError::from)?;

            // Send refresh finished event
            let _ =
                self.event_bus
                    .send(crate::domain::events::NotificationEvent::RefreshFinished {
                        anime_id: id,
                        title: anime.title.romaji,
                    });
        }

        // Remove from recent_fetches to bypass 5-minute throttle for explicit refresh
        if let Ok(mut guard) = self.recent_fetches.write() {
            guard.remove(&id);
        }

        // Fetch and cache episodes (upsert handles updates, no need to clear first)
        let count =
            self.fetch_and_cache_episodes(id)
                .await
                .map_err(|e| EpisodeError::ExternalApi {
                    service: "External".to_string(),
                    message: e.to_string(),
                })?;

        Ok(count)
    }

    async fn refresh_all_active_metadata(&self) -> Result<(), EpisodeError> {
        let start = Instant::now();
        info!(
            event = "metadata_refresh_started",
            "Refreshing metadata for airing anime..."
        );

        let monitored = self
            .store
            .list_monitored()
            .await
            .map_err(EpisodeError::from)?;
        let releasing: Vec<_> = monitored
            .into_iter()
            .filter(|a| a.status == "RELEASING" || a.status == "NOT_YET_RELEASED")
            .collect();

        let count = releasing.len();
        info!(count, "Found anime to refresh metadata for");

        let mut errors = 0;
        for anime in releasing {
            if let Err(e) = self.fetch_and_cache_episodes(anime.id).await {
                warn!(
                    anime = %anime.title.romaji,
                    error = %e,
                    "Failed to refresh metadata"
                );
                errors += 1;
            }

            tokio::time::sleep(Duration::from_secs(2)).await;
        }

        info!(
            event = "metadata_refresh_finished",
            processed = count,
            errors = errors,
            duration_ms = u64::try_from(start.elapsed().as_millis()).unwrap_or(u64::MAX),
            "Metadata refresh complete"
        );

        Ok(())
    }

    async fn list_all_missing(&self, limit: u64) -> Result<Vec<MissingEpisodeDto>, EpisodeError> {
        let missing = self
            .store
            .get_all_missing_episodes(limit)
            .await
            .map_err(EpisodeError::from)?;

        let dtos = missing
            .into_iter()
            .map(|row| MissingEpisodeDto {
                anime_id: row.anime_id,
                anime_title: row.anime_title,
                episode_number: row.episode_number,
                episode_title: row.episode_title,
                aired: row.aired,
                anime_image: row.anime_image.map(|p| format!("/images/{p}")),
            })
            .collect();

        Ok(dtos)
    }

    async fn get_calendar(
        &self,
        start: &str,
        end: &str,
    ) -> Result<Vec<CalendarEventDto>, EpisodeError> {
        let events = self
            .store
            .get_calendar_events(start, end)
            .await
            .map_err(EpisodeError::from)?;

        let dtos = events
            .into_iter()
            .map(|e| {
                let ep_num = e.episode_number;
                let anime_id = e.anime_id;

                let title = e.episode_title.as_ref().map_or_else(
                    || format!("Episode {ep_num}"),
                    |t| format!("{ep_num} - {t}"),
                );

                let date = e.aired.unwrap_or_default();

                CalendarEventDto {
                    id: format!("{anime_id}-{ep_num}"),
                    title,
                    start: date.clone(),
                    end: date,
                    all_day: true,
                    extended_props: CalendarEventProps {
                        anime_id: i32::try_from(anime_id).unwrap_or_default(),
                        anime_title: e.anime_title,
                        episode_number: i32::try_from(ep_num).unwrap_or_default(),
                        downloaded: e.downloaded,
                        anime_image: e.anime_image.map(|p| format!("/images/{p}")),
                    },
                }
            })
            .collect();

        Ok(dtos)
    }
}

impl Clone for SeaOrmEpisodeService {
    fn clone(&self) -> Self {
        Self {
            store: self.store.clone(),
            anilist: self.anilist.clone(),
            jikan: self.jikan.clone(),
            kitsu: self.kitsu.clone(),
            offline_db: self.offline_db.clone(),
            image_service: self.image_service.clone(),
            config: self.config.clone(),
            event_bus: self.event_bus.clone(),
            recent_fetches: self.recent_fetches.clone(),
        }
    }
}
