//! `SeaORM` implementation of the `LibraryService` trait.
//!
//! This implementation provides:
//! - Efficient batch queries to prevent N+1 problems
//! - Proper error mapping from `SeaORM` to domain errors
//! - Background task spawning for post-import operations

#![allow(
    clippy::cast_possible_truncation,
    clippy::cast_possible_wrap,
    reason = "Domain constraints ensure values fit in target types"
)]

use std::collections::{HashMap, HashSet};
use std::path::Path;
use std::sync::Arc;
use tokio::sync::RwLock;

use crate::config::Config;
use crate::db::Store;
use crate::domain::AnimeId;
use crate::services::library_service::{ActivityItem, ImportFolderRequest, LibraryStats};
use crate::services::scanner::ScannerState;
use crate::services::{
    AnimeMetadataService, ImageService, LibraryError, LibraryScannerService, LibraryService,
};

/// SeaORM-based implementation of the `LibraryService` trait.
pub struct SeaOrmLibraryService {
    store: Store,
    config: Arc<RwLock<Config>>,
    anilist: Arc<crate::clients::anilist::AnilistClient>,
    library_scanner: Arc<LibraryScannerService>,
    metadata_service: Arc<AnimeMetadataService>,
    image_service: Arc<ImageService>,
    event_bus: tokio::sync::broadcast::Sender<crate::domain::events::NotificationEvent>,
}

impl SeaOrmLibraryService {
    /// Creates a new instance of the library service.
    ///
    /// # Arguments
    ///
    /// * `store` - Database store for persistence operations
    /// * `config` - Application configuration (read-heavy, wrapped in `RwLock`)
    /// * `anilist` - `AniList` client for metadata fetching
    /// * `library_scanner` - Service for scanning unmapped folders
    /// * `metadata_service` - Service for enriching anime metadata
    /// * `image_service` - Service for downloading and caching images
    /// * `event_bus` - Event bus for broadcasting scan/import events
    #[must_use]
    pub const fn new(
        store: Store,
        config: Arc<RwLock<Config>>,
        anilist: Arc<crate::clients::anilist::AnilistClient>,
        library_scanner: Arc<LibraryScannerService>,
        metadata_service: Arc<AnimeMetadataService>,
        image_service: Arc<ImageService>,
        event_bus: tokio::sync::broadcast::Sender<crate::domain::events::NotificationEvent>,
    ) -> Self {
        Self {
            store,
            config,
            anilist,
            library_scanner,
            metadata_service,
            image_service,
            event_bus,
        }
    }

    /// Helper to resolve quality profile ID.
    ///
    /// Attempts to find profile by name, falls back to first configured profile.
    async fn resolve_quality_profile(
        &self,
        profile_name: Option<&String>,
    ) -> Result<Option<i32>, LibraryError> {
        if let Some(name) = profile_name
            && let Some(profile) = self
                .store
                .get_quality_profile_by_name(name)
                .await
                .map_err(|e| LibraryError::Database(e.to_string()))?
        {
            return Ok(Some(profile.id));
        }

        // Read config briefly to get default profile name, then release lock
        let default_profile_name = {
            let config = self.config.read().await;
            config.profiles.first().map(|p| p.name.clone())
        };

        if let Some(name) = default_profile_name
            && let Some(profile) = self
                .store
                .get_quality_profile_by_name(&name)
                .await
                .map_err(|e| LibraryError::Database(e.to_string()))?
        {
            return Ok(Some(profile.id));
        }

        Ok(None)
    }
}

#[async_trait::async_trait]
impl LibraryService for SeaOrmLibraryService {
    async fn get_stats(&self) -> Result<LibraryStats, LibraryError> {
        // Fetch monitored anime list
        let anime_list = self.store.list_monitored().await?;
        let total_anime = anime_list.len() as i32;

        // Collect IDs for batch operations
        let anime_ids: Vec<i32> = anime_list.iter().map(|a| a.id).collect();

        // Batch fetch download counts (prevents N+1)
        let download_counts = self
            .store
            .get_download_counts_for_anime_ids(&anime_ids)
            .await?;

        // Calculate aggregates
        let mut total_episodes = 0i32;
        let mut downloaded_episodes = 0i32;

        for anime in &anime_list {
            let ep_count = anime.episode_count.unwrap_or(0);
            total_episodes = total_episodes.saturating_add(ep_count);

            let downloaded = download_counts.get(&anime.id).copied().unwrap_or(0);
            downloaded_episodes = downloaded_episodes.saturating_add(downloaded);
        }

        let missing_episodes = self
            .store
            .get_total_missing_episodes_count()
            .await
            .unwrap_or(0) as i32;

        // Fetch RSS and recent download counts
        let feeds = self.store.get_enabled_rss_feeds().await.unwrap_or_default();
        let recent = self.store.recent_downloads(7i32).await.unwrap_or_default();

        Ok(LibraryStats {
            total_anime,
            total_episodes,
            downloaded_episodes,
            missing_episodes,
            rss_feeds: feeds.len() as i32,
            recent_downloads: recent.len() as i32,
        })
    }

    async fn get_activity(&self, limit: usize) -> Result<Vec<ActivityItem>, LibraryError> {
        // 1. Fetch recent downloads
        let downloads = self.store.recent_downloads(limit as i32).await?;
        if downloads.is_empty() {
            return Ok(Vec::new());
        }

        // 2. Collect unique anime IDs for batch fetch (N+1 Prevention)
        let anime_ids: HashSet<i32> = downloads.iter().map(|d| d.anime_id).collect();
        let anime_ids_vec: Vec<i32> = anime_ids.into_iter().collect();

        // 3. Batch fetch all related anime in one query
        let anime_list = self.store.get_animes_by_ids(&anime_ids_vec).await?;

        // 4. Build lookup map for O(1) access
        let anime_map: HashMap<i32, crate::models::anime::Anime> =
            anime_list.into_iter().map(|a| (a.id, a)).collect();

        // 5. Construct activity items using the pre-fetched map
        let mut activities = Vec::with_capacity(downloads.len());
        for download in downloads {
            let anime_title = anime_map.get(&download.anime_id).map_or_else(
                || format!("Anime #{})", download.anime_id),
                |a| {
                    a.title
                        .english
                        .clone()
                        .unwrap_or_else(|| a.title.romaji.clone())
                },
            );

            activities.push(ActivityItem {
                id: download.id,
                activity_type: "download".to_string(),
                anime_id: AnimeId::new(download.anime_id),
                anime_title,
                episode_number: Some(download.episode_number),
                description: format!("Downloaded episode {}", download.episode_number),
                timestamp: download.download_date,
            });
        }

        Ok(activities)
    }

    async fn import_folder(&self, request: ImportFolderRequest) -> Result<(), LibraryError> {
        // 1. Fetch metadata from AniList
        let mut anime = self
            .anilist
            .get_by_id(request.anime_id.value())
            .await
            .map_err(|e| LibraryError::anilist_error(e.to_string()))?
            .ok_or(LibraryError::NotFound(request.anime_id))?;

        // 2. Validate path exists on disk
        let library_path = {
            let config = self.config.read().await;
            Path::new(&config.library.library_path).to_path_buf()
        };
        let full_path = library_path.join(&request.folder_name);

        // CPU-intensive: path existence check (offloaded to blocking thread)
        let path_exists = tokio::task::spawn_blocking({
            let path = full_path.clone();
            move || path.exists()
        })
        .await
        .map_err(|e| LibraryError::Validation(format!("Path check failed: {e}")))?;

        if !path_exists {
            return Err(LibraryError::Validation(format!(
                "Folder does not exist: {}",
                full_path.display()
            )));
        }

        // 3. Resolve quality profile
        let profile_id = self
            .resolve_quality_profile(request.profile_name.as_ref())
            .await?;

        // 4. Check for duplicates
        if self.store.get_anime(anime.id).await?.is_some() {
            return Err(LibraryError::Validation(
                "Anime already exists in library".into(),
            ));
        }

        // 5. Configure and save anime
        anime.path = Some(full_path.to_string_lossy().to_string());
        anime.quality_profile_id = profile_id;

        // Enrich metadata and set timestamp, tracking provenance
        let (_, provenance_json) = self
            .metadata_service
            .enrich_anime_metadata(&mut anime)
            .await;
        anime.metadata_provenance = provenance_json;
        anime.added_at = chrono::Utc::now().to_rfc3339();

        self.store.add_anime(&anime).await?;

        // 6. Spawn background tasks (fire & forget)
        let store = self.store.clone();
        let event_bus = self.event_bus.clone();
        let image_service = self.image_service.clone();
        let anime_clone = anime.clone();
        let folder_path = full_path.clone();

        // Task A: Scan folder for episodes
        tokio::spawn(async move {
            tracing::info!(
                anime_id = anime_clone.id,
                path = %folder_path.display(),
                "Starting post-import folder scan"
            );

            if let Err(e) =
                scan_folder_for_episodes(&store, &event_bus, anime_clone.id, &folder_path).await
            {
                tracing::warn!(
                    error = %e,
                    anime_id = anime_clone.id,
                    "Post-import scan failed"
                );
            }
        });

        // Task B: Download images
        tokio::spawn(async move {
            use crate::services::image::ImageType;

            if let Some(url) = &anime_clone.cover_image {
                let _ = image_service
                    .save_image(url, anime_clone.id, ImageType::Cover)
                    .await;
            }
            if let Some(url) = &anime_clone.banner_image {
                let _ = image_service
                    .save_image(url, anime_clone.id, ImageType::Banner)
                    .await;
            }
        });

        tracing::info!(
            anime_id = anime.id,
            title = %anime.title.romaji,
            "Successfully imported folder"
        );

        Ok(())
    }

    async fn get_unmapped_folders(&self) -> Result<ScannerState, LibraryError> {
        Ok(self.library_scanner.get_state().await)
    }

    async fn start_unmapped_scan(&self) -> Result<(), LibraryError> {
        self.library_scanner.start_scan().await;
        Ok(())
    }
}

/// Scans a folder for video files and marks episodes as downloaded.
///
/// This is a shared helper that can be used by both the library service
/// and other handlers (e.g., episode scanning endpoints).
///
/// # Errors
///
/// Returns `anyhow::Error` on I/O failures or database errors.
pub async fn scan_folder_for_episodes(
    store: &Store,
    event_bus: &tokio::sync::broadcast::Sender<crate::domain::events::NotificationEvent>,
    anime_id: i32,
    folder_path: &Path,
) -> anyhow::Result<i32> {
    let start = std::time::Instant::now();

    // Get anime title for events
    let anime_title = match store.get_anime(anime_id).await? {
        Some(a) => a.title.romaji,
        None => format!("Anime #{anime_id}"),
    };

    // Send start event
    let _ = event_bus.send(
        crate::domain::events::NotificationEvent::ScanFolderStarted {
            anime_id,
            title: anime_title.clone(),
        },
    );

    tracing::debug!(path = %folder_path.display(), "Scanning folder for episodes");

    // Collect and parse episodes
    let found_episodes = collect_and_parse_episodes(folder_path).await;

    // Mark episodes as downloaded
    for (episode_number, season, file_path, quality_id, file_size) in &found_episodes {
        if let Err(e) = store
            .mark_episode_downloaded(
                anime_id,
                *episode_number,
                season.unwrap_or(1),
                *quality_id,
                false, // not a special
                file_path,
                *file_size,
                None, // no media info yet
            )
            .await
        {
            tracing::warn!(
                episode = episode_number,
                error = %e,
                "Failed to mark episode as downloaded"
            );
        } else {
            tracing::debug!(
                episode = episode_number,
                path = %file_path,
                "Detected episode from folder scan"
            );
        }
    }

    let count = found_episodes.len();
    let count_i32 = count as i32;
    tracing::info!(
        event = "folder_scan_finished",
        anime_id = anime_id,
        found_episodes = count,
        duration_ms = start.elapsed().as_millis() as u64,
        "Folder scan finished"
    );

    // Send completion event
    let _ = event_bus.send(
        crate::domain::events::NotificationEvent::ScanFolderFinished {
            anime_id,
            title: anime_title,
            found: count_i32,
        },
    );

    Ok(count_i32)
}

/// Recursively collects and parses video files in a directory.
///
/// # Returns
///
/// Vector of tuples containing:
/// - Episode number
/// - Season number (if detected)
/// - File path
/// - Quality ID
/// - File size (optional)
pub async fn collect_and_parse_episodes(
    folder_path: &Path,
) -> Vec<(i32, Option<i32>, String, i32, Option<i64>)> {
    use crate::constants::VIDEO_EXTENSIONS;
    use crate::parser::filename::parse_filename;
    use crate::quality::parse_quality_from_filename;
    use std::collections::{HashSet, VecDeque};

    let mut dirs_to_visit = VecDeque::new();
    dirs_to_visit.push_back(folder_path.to_path_buf());

    let mut found_episodes = Vec::new();
    let mut visited_paths = HashSet::new();

    while let Some(current_dir) = dirs_to_visit.pop_front() {
        // Skip already visited directories (prevents cycles from symlinks)
        if !visited_paths.insert(current_dir.clone()) {
            continue;
        }

        // Read directory entries
        let mut entries = match tokio::fs::read_dir(&current_dir).await {
            Ok(entries) => entries,
            Err(e) => {
                tracing::warn!(
                    path = %current_dir.display(),
                    error = %e,
                    "Failed to read directory"
                );
                continue;
            }
        };

        // Process each entry
        while let Ok(Some(entry)) = entries.next_entry().await {
            let path = entry.path();

            // Handle directories (skip hidden)
            if path.is_dir() {
                if let Some(name) = path.file_name().and_then(|n| n.to_str())
                    && !name.starts_with('.')
                {
                    dirs_to_visit.push_back(path);
                }
                continue;
            }

            // Handle files - check for video extension
            if let Some(ext) = path.extension() {
                let ext_lower = ext.to_string_lossy().to_lowercase();
                if VIDEO_EXTENSIONS.contains(&ext_lower.as_str())
                    && let Some(filename) = path.file_name()
                {
                    let filename_str = filename.to_string_lossy();

                    // Parse filename for episode info
                    if let Some(parsed) = parse_filename(&filename_str) {
                        #[allow(clippy::cast_possible_truncation)]
                        let episode_number = parsed.episode_number.floor() as i32;
                        let quality = parse_quality_from_filename(&filename_str);

                        // Get file size
                        let file_size = tokio::fs::metadata(&path)
                            .await
                            .map(|m| m.len() as i64)
                            .ok();

                        found_episodes.push((
                            episode_number,
                            parsed.season,
                            path.to_string_lossy().to_string(),
                            quality.id,
                            file_size,
                        ));
                    }
                }
            }
        }
    }

    found_episodes
}
