//! `SeaORM` implementation of the `AnimeService` trait.
//!
//! This module provides the concrete implementation of [`AnimeService`] using
//! `SeaORM` for database access. It parallelizes auxiliary queries for performance.

use crate::api::types::{AnimeDto, SearchResultDto, TitleDto};
use crate::clients::anilist::AnilistClient;
use crate::config::Config;
use crate::db::Store;
use crate::domain::AnimeId;
use crate::library::LibraryService;
use crate::models::anime::Anime;
use crate::services::anime_service::{AnimeError, AnimeService, anime_to_dto};
use crate::services::{AnimeMetadataService, ImageService};
use std::sync::Arc;
use tokio::sync::RwLock;

/// SeaORM-based implementation of [`AnimeService`].
///
/// This implementation:
/// - Parallelizes independent database queries for better performance
/// - Maps `SeaORM` errors to domain errors
/// - Provides clean separation between domain and infrastructure
pub struct SeaOrmAnimeService {
    store: Arc<Store>,
    anilist: Arc<AnilistClient>,
    image_service: Arc<ImageService>,
    metadata_service: Arc<AnimeMetadataService>,
    config: Arc<RwLock<Config>>,
    event_bus: tokio::sync::broadcast::Sender<crate::domain::events::NotificationEvent>,
}

impl SeaOrmAnimeService {
    /// Creates a new instance of the service.
    #[must_use]
    pub const fn new(
        store: Arc<Store>,
        anilist: Arc<AnilistClient>,
        image_service: Arc<ImageService>,
        metadata_service: Arc<AnimeMetadataService>,
        config: Arc<RwLock<Config>>,
        event_bus: tokio::sync::broadcast::Sender<crate::domain::events::NotificationEvent>,
    ) -> Self {
        Self {
            store,
            anilist,
            image_service,
            metadata_service,
            config,
            event_bus,
        }
    }

    /// Resolves the root folder path for an anime.
    ///
    /// Uses custom path if provided, otherwise derives from anime title and library config.
    async fn resolve_root_path(
        &self,
        anime: &Anime,
        custom_root: Option<&str>,
    ) -> anyhow::Result<std::path::PathBuf> {
        let library_config = self.config.read().await.library.clone();
        let library_service = LibraryService::new(library_config);
        let custom_path = custom_root.map(std::path::Path::new);
        Ok(library_service.build_anime_root_path(anime, custom_path))
    }

    /// Builds an `AnimeDto` from the core anime data and supplementary info.
    ///
    /// This method fetches download counts, missing episodes, and release profiles
    /// in parallel for optimal performance.
    async fn build_anime_dto(&self, anime: Anime) -> Result<AnimeDto, AnimeError> {
        let anime_id = anime.id;

        // Parallelize independent queries (Performance Fix for N+1)
        let (downloaded_result, missing_result, profiles_result) = tokio::join!(
            self.store.get_downloaded_count(anime_id),
            async {
                if let Some(total) = anime.episode_count {
                    self.store.get_missing_episodes(anime_id, total).await
                } else {
                    Ok(Vec::new())
                }
            },
            self.store.get_assigned_release_profile_ids(anime_id)
        );

        // Handle results with proper error conversion
        let downloaded = downloaded_result.map_err(|e| AnimeError::Database(e.to_string()))?;
        let missing = missing_result.map_err(|e| AnimeError::Database(e.to_string()))?;
        let release_profile_ids =
            profiles_result.map_err(|e| AnimeError::Database(e.to_string()))?;

        Ok(anime_to_dto(
            anime,
            downloaded,
            missing,
            release_profile_ids,
        ))
    }
}

#[async_trait::async_trait]
impl AnimeService for SeaOrmAnimeService {
    async fn get_anime_details(&self, id: AnimeId) -> Result<AnimeDto, AnimeError> {
        let anime = self
            .store
            .get_anime(id.value())
            .await
            .map_err(|e| AnimeError::Database(e.to_string()))?
            .ok_or(AnimeError::NotFound(id))?;

        self.build_anime_dto(anime).await
    }

    async fn list_monitored_anime(&self) -> Result<Vec<AnimeDto>, AnimeError> {
        let anime_list = self
            .store
            .list_monitored()
            .await
            .map_err(|e| AnimeError::Database(e.to_string()))?;

        // Batch fetch download counts and episodes for all anime
        let anime_ids: Vec<i32> = anime_list.iter().map(|a| a.id).collect();

        let (download_counts, downloaded_episodes, release_profiles) = tokio::join!(
            self.store.get_download_counts_for_anime_ids(&anime_ids),
            self.store.get_downloaded_episodes_for_anime_ids(&anime_ids),
            self.store
                .get_assigned_release_profiles_for_anime_ids(&anime_ids)
        );

        let download_counts = download_counts.map_err(|e| AnimeError::Database(e.to_string()))?;
        let mut downloaded_episodes =
            downloaded_episodes.map_err(|e| AnimeError::Database(e.to_string()))?;
        let release_profiles = release_profiles.map_err(|e| AnimeError::Database(e.to_string()))?;

        // Pre-sort downloaded episodes for O(N) missing calculation
        for episodes in downloaded_episodes.values_mut() {
            episodes.sort_unstable();
        }

        let mut results = Vec::with_capacity(anime_list.len());
        for anime in anime_list {
            let downloaded = *download_counts.get(&anime.id).unwrap_or(&0);

            let missing = if let Some(total) = anime.episode_count {
                let eps = downloaded_episodes
                    .get(&anime.id)
                    .map_or(&[] as &[i32], Vec::as_slice);
                crate::services::anime_service::calculate_missing_episodes(total, eps)
            } else {
                Vec::new()
            };

            let release_profile_ids = release_profiles.get(&anime.id).cloned().unwrap_or_default();

            results.push(anime_to_dto(
                anime,
                downloaded,
                missing,
                release_profile_ids,
            ));
        }

        Ok(results)
    }

    async fn list_all_anime(&self) -> Result<Vec<AnimeDto>, AnimeError> {
        // Reuse monitored logic but fetch all anime
        let anime_list = self
            .store
            .list_all_anime()
            .await
            .map_err(|e| AnimeError::Database(e.to_string()))?;

        let anime_ids: Vec<i32> = anime_list.iter().map(|a| a.id).collect();

        let (download_counts, downloaded_episodes, release_profiles) = tokio::join!(
            self.store.get_download_counts_for_anime_ids(&anime_ids),
            self.store.get_downloaded_episodes_for_anime_ids(&anime_ids),
            self.store
                .get_assigned_release_profiles_for_anime_ids(&anime_ids)
        );

        let download_counts = download_counts.map_err(|e| AnimeError::Database(e.to_string()))?;
        let mut downloaded_episodes =
            downloaded_episodes.map_err(|e| AnimeError::Database(e.to_string()))?;
        let release_profiles = release_profiles.map_err(|e| AnimeError::Database(e.to_string()))?;

        for episodes in downloaded_episodes.values_mut() {
            episodes.sort_unstable();
        }

        let mut results = Vec::with_capacity(anime_list.len());
        for anime in anime_list {
            let downloaded = *download_counts.get(&anime.id).unwrap_or(&0);

            let missing = if let Some(total) = anime.episode_count {
                let eps = downloaded_episodes
                    .get(&anime.id)
                    .map_or(&[] as &[i32], Vec::as_slice);
                crate::services::anime_service::calculate_missing_episodes(total, eps)
            } else {
                Vec::new()
            };

            let release_profile_ids = release_profiles.get(&anime.id).cloned().unwrap_or_default();

            results.push(anime_to_dto(
                anime,
                downloaded,
                missing,
                release_profile_ids,
            ));
        }

        Ok(results)
    }

    async fn add_anime(
        &self,
        id: AnimeId,
        profile_name: Option<String>,
        root_folder: Option<String>,
        monitored: bool,
        release_profile_ids: &[i32],
    ) -> Result<AnimeDto, AnimeError> {
        use crate::services::image::ImageType;

        // Fetch from AniList
        let mut anime = self
            .anilist
            .get_by_id(id.value())
            .await
            .map_err(|e| AnimeError::anilist_error(e.to_string()))?
            .ok_or(AnimeError::NotFound(id))?;

        // Set quality profile if specified
        if let Some(profile_name) = &profile_name
            && let Some(profile) = self
                .store
                .get_quality_profile_by_name(profile_name)
                .await
                .map_err(|e| AnimeError::Database(e.to_string()))?
        {
            anime.quality_profile_id = Some(profile.id);
        }

        // Resolve and create root folder path
        let root_path = self
            .resolve_root_path(&anime, root_folder.as_deref())
            .await
            .map_err(|e| AnimeError::InvalidData(format!("Failed to resolve anime path: {e}")))?;

        if let Err(e) = tokio::fs::create_dir_all(&root_path).await {
            tracing::error!("Failed to create anime directory: {}", e);
        }

        anime.path = Some(root_path.to_string_lossy().to_string());

        // Parallelize image downloading (metadata enrichment happens after images)
        let cover_url = anime.cover_image.clone();
        let banner_url = anime.banner_image.clone();
        let anime_id_val = anime.id;
        let image_service_cover = self.image_service.clone();
        let image_service_banner = self.image_service.clone();

        let cover_future = async move {
            if let Some(url) = cover_url {
                image_service_cover
                    .save_image(&url, anime_id_val, ImageType::Cover)
                    .await
                    .ok()
            } else {
                None
            }
        };

        let banner_future = async move {
            if let Some(url) = banner_url {
                image_service_banner
                    .save_image(&url, anime_id_val, ImageType::Banner)
                    .await
                    .ok()
            } else {
                None
            }
        };

        let (cover_path, banner_path) = tokio::join!(cover_future, banner_future);

        if let Some(path) = cover_path {
            anime.cover_image = Some(path);
        }
        if let Some(path) = banner_path {
            anime.banner_image = Some(path);
        }

        // Enrich metadata after images are downloaded
        self.metadata_service
            .enrich_anime_metadata(&mut anime)
            .await;

        anime.added_at = chrono::Utc::now().to_rfc3339();
        anime.monitored = monitored;

        self.store
            .add_anime(&anime)
            .await
            .map_err(|e| AnimeError::Database(e.to_string()))?;

        // Assign release profiles if specified
        if !release_profile_ids.is_empty()
            && let Err(e) = self
                .store
                .assign_release_profiles_to_anime(anime.id, release_profile_ids)
                .await
        {
            tracing::error!("Failed to assign release profiles: {}", e);
        }

        // Return the newly added anime
        self.build_anime_dto(anime).await
    }

    async fn remove_anime(&self, id: AnimeId) -> Result<(), AnimeError> {
        // Check existence first
        if self
            .store
            .get_anime(id.value())
            .await
            .map_err(|e| AnimeError::Database(e.to_string()))?
            .is_none()
        {
            return Err(AnimeError::NotFound(id));
        }

        self.store
            .remove_anime(id.value())
            .await
            .map_err(|e| AnimeError::Database(e.to_string()))?;

        Ok(())
    }

    async fn toggle_monitor(&self, id: AnimeId, monitored: bool) -> Result<(), AnimeError> {
        // Check existence first
        if self
            .store
            .get_anime(id.value())
            .await
            .map_err(|e| AnimeError::Database(e.to_string()))?
            .is_none()
        {
            return Err(AnimeError::NotFound(id));
        }

        self.store
            .toggle_monitor(id.value(), monitored)
            .await
            .map_err(|e| AnimeError::Database(e.to_string()))?;

        Ok(())
    }

    async fn update_quality_profile(
        &self,
        id: AnimeId,
        profile_name: String,
    ) -> Result<(), AnimeError> {
        // Check anime existence
        if self
            .store
            .get_anime(id.value())
            .await
            .map_err(|e| AnimeError::Database(e.to_string()))?
            .is_none()
        {
            return Err(AnimeError::NotFound(id));
        }

        // Get profile
        let profile = self
            .store
            .get_quality_profile_by_name(&profile_name)
            .await
            .map_err(|e| AnimeError::Database(e.to_string()))?
            .ok_or_else(|| AnimeError::InvalidData(format!("Profile not found: {profile_name}")))?;

        self.store
            .update_anime_quality_profile(id.value(), profile.id)
            .await
            .map_err(|e| AnimeError::Database(e.to_string()))?;

        Ok(())
    }

    async fn assign_release_profiles(
        &self,
        id: AnimeId,
        profile_ids: Vec<i32>,
    ) -> Result<(), AnimeError> {
        // Check existence
        if self
            .store
            .get_anime(id.value())
            .await
            .map_err(|e| AnimeError::Database(e.to_string()))?
            .is_none()
        {
            return Err(AnimeError::NotFound(id));
        }

        self.store
            .assign_release_profiles_to_anime(id.value(), &profile_ids)
            .await
            .map_err(|e| AnimeError::Database(e.to_string()))?;

        Ok(())
    }

    async fn update_anime_path(
        &self,
        id: AnimeId,
        path: String,
        rescan: bool,
    ) -> Result<(), AnimeError> {
        use std::path::Path;

        // Check existence
        if self
            .store
            .get_anime(id.value())
            .await
            .map_err(|e| AnimeError::Database(e.to_string()))?
            .is_none()
        {
            return Err(AnimeError::NotFound(id));
        }

        let path_obj = Path::new(&path);
        if !path_obj.exists() {
            return Err(AnimeError::InvalidData(format!(
                "Path does not exist: {path}"
            )));
        }

        self.store
            .update_anime_path(id.value(), &path)
            .await
            .map_err(|e| AnimeError::Database(e.to_string()))?;

        if rescan {
            let store = self.store.clone();
            let event_bus = self.event_bus.clone();
            let folder_path = std::path::PathBuf::from(&path);
            let anime_id = id.value();

            tokio::spawn(async move {
                if let Err(e) = crate::services::scan_folder_for_episodes(
                    &store,
                    &event_bus,
                    anime_id,
                    &folder_path,
                )
                .await
                {
                    tracing::warn!("Failed to scan folder for episodes: {}", e);
                }
            });
        }

        Ok(())
    }

    async fn search_remote_anime(&self, query: &str) -> Result<Vec<SearchResultDto>, AnimeError> {
        // Fetch monitored list
        let monitored = self
            .store
            .list_monitored()
            .await
            .map_err(|e| AnimeError::Database(e.to_string()))?;
        let monitored_ids: std::collections::HashSet<i32> =
            monitored.iter().map(|a| a.id).collect();

        // Search AniList
        let results = self
            .anilist
            .search_anime(query)
            .await
            .map_err(|e| AnimeError::anilist_error(e.to_string()))?;

        // Map to SearchResultDto
        let dtos: Vec<SearchResultDto> = results
            .into_iter()
            .map(|anime| SearchResultDto {
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
            })
            .collect();

        Ok(dtos)
    }

    async fn get_remote_anime(&self, id: AnimeId) -> Result<SearchResultDto, AnimeError> {
        // Fetch monitored list
        let monitored = self
            .store
            .list_monitored()
            .await
            .map_err(|e| AnimeError::Database(e.to_string()))?;
        let monitored_ids: std::collections::HashSet<i32> =
            monitored.iter().map(|a| a.id).collect();

        // Get from AniList
        let anime = self
            .anilist
            .get_by_id(id.value())
            .await
            .map_err(|e| AnimeError::anilist_error(e.to_string()))?;

        anime
            .map(|a| SearchResultDto {
                id: a.id,
                title: TitleDto {
                    romaji: a.title.romaji,
                    english: a.title.english,
                    native: a.title.native,
                },
                format: a.format,
                episode_count: a.episode_count,
                status: a.status,
                cover_image: a.cover_image,
                already_in_library: monitored_ids.contains(&a.id),
            })
            .ok_or(AnimeError::NotFound(id))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::AnimeId;

    // Note: Integration tests would require a test database setup.
    // These are placeholder tests demonstrating the test structure.

    #[test]
    fn anime_id_converts_correctly() {
        let id = AnimeId::new(42);
        assert_eq!(id.value(), 42);
    }

    #[tokio::test]
    async fn error_conversions_work() {
        // Test that sea_orm::DbErr converts to AnimeError::Database
        let db_err = sea_orm::DbErr::Custom("test".to_string());
        let anime_err: AnimeError = db_err.into();
        assert!(matches!(anime_err, AnimeError::Database(_)));
    }
}
