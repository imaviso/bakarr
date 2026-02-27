use crate::clients::seadex::SeaDexRelease;
use crate::config::QualityProfileConfig;
use crate::models::anime::Anime;
use crate::models::episode::{EpisodeInput, EpisodeStatusInput};
use crate::models::media::MediaInfo;
use crate::services::search::SearchResult;
use anyhow::Result;
use sea_orm::{ConnectOptions, ConnectionTrait, Database, DatabaseConnection, Statement};
use std::path::Path;
use std::time::Duration;
use tracing::info;

use crate::entities::episode_metadata;

pub mod migrator;
pub mod repositories;

pub use crate::entities::system_logs::Model as SystemLog;
pub use repositories::cache::SeaDexCache;
pub use repositories::download::{DownloadEntry, RecycleBinEntry};
pub use repositories::episode::{CalendarEventRow, MissingEpisodeRow};
pub use repositories::quality::QualityProfileRow;
pub use repositories::rss::RssFeed;

pub use crate::models::episode::EpisodeStatusRow;

#[derive(Clone)]
pub struct Store {
    pub conn: DatabaseConnection,
}

impl Store {
    pub async fn new(db_url: &str) -> Result<Self> {
        Self::with_pool_options(db_url, 5, 1).await
    }

    pub async fn with_pool_options(
        db_url: &str,
        max_connections: u32,
        min_connections: u32,
    ) -> Result<Self> {
        use sea_orm_migration::MigratorTrait;

        if !db_url.starts_with(":memory:") {
            let path_str = db_url.trim_start_matches("sqlite:");
            if let Some(parent) = Path::new(path_str).parent() {
                tokio::fs::create_dir_all(parent).await.ok();
            }
            if !Path::new(path_str).exists() {
                std::fs::File::create(path_str)?;
            }
        }

        let mut opt = ConnectOptions::new(db_url.to_string());
        opt.max_connections(max_connections)
            .min_connections(min_connections)
            .connect_timeout(Duration::from_secs(10))
            .acquire_timeout(Duration::from_secs(10))
            .idle_timeout(Duration::from_secs(300))
            .max_lifetime(Duration::from_secs(600))
            .sqlx_logging(false);

        let conn = Database::connect(opt).await?;

        migrator::Migrator::up(&conn, None).await?;

        info!(
            "Database connected & migrations applied (pool: {}-{})",
            min_connections, max_connections
        );

        Ok(Self { conn })
    }

    pub async fn ping(&self) -> Result<()> {
        let backend = self.conn.get_database_backend();
        self.conn
            .query_one(Statement::from_string(backend, "SELECT 1".to_string()))
            .await?;
        Ok(())
    }

    fn anime_repo(&self) -> repositories::anime::AnimeRepository {
        repositories::anime::AnimeRepository::new(self.conn.clone())
    }

    fn anime_metadata_repo(&self) -> repositories::anime_metadata::AnimeMetadataRepository {
        repositories::anime_metadata::AnimeMetadataRepository::new(self.conn.clone())
    }

    fn episode_repo(&self) -> repositories::episode::EpisodeRepository {
        repositories::episode::EpisodeRepository::new(self.conn.clone())
    }

    fn download_repo(&self) -> repositories::download::DownloadRepository {
        repositories::download::DownloadRepository::new(self.conn.clone())
    }

    fn rss_repo(&self) -> repositories::rss::RssRepository {
        repositories::rss::RssRepository::new(self.conn.clone())
    }

    fn logs_repo(&self) -> repositories::logs::LogRepository {
        repositories::logs::LogRepository::new(self.conn.clone())
    }

    fn cache_repo(&self) -> repositories::cache::CacheRepository {
        repositories::cache::CacheRepository::new(self.conn.clone())
    }

    fn quality_repo(&self) -> repositories::quality::QualityRepository {
        repositories::quality::QualityRepository::new(self.conn.clone())
    }

    fn release_profile_repo(&self) -> repositories::release_profile::ReleaseProfileRepository {
        repositories::release_profile::ReleaseProfileRepository::new(self.conn.clone())
    }

    pub async fn initialize_quality_system(&self, config: &crate::config::Config) -> Result<()> {
        self.quality_repo().initialize(config).await
    }

    pub async fn add_anime(&self, anime: &Anime) -> Result<()> {
        self.anime_repo().add(anime).await
    }

    pub async fn get_anime(&self, id: i32) -> Result<Option<Anime>> {
        self.anime_repo().get(id).await
    }

    pub async fn get_animes_by_ids(&self, ids: &[i32]) -> Result<Vec<Anime>> {
        self.anime_repo().get_by_ids(ids).await
    }

    pub async fn list_monitored(&self) -> Result<Vec<Anime>> {
        self.anime_repo().list_monitored().await
    }

    pub async fn list_monitored_stats(&self) -> Result<Vec<(i32, Option<i32>)>> {
        self.anime_repo().list_monitored_stats().await
    }

    pub async fn list_all_anime(&self) -> Result<Vec<Anime>> {
        self.anime_repo().list_all().await
    }

    pub async fn remove_anime(&self, id: i32) -> Result<bool> {
        self.anime_repo().remove(id).await
    }

    pub async fn get_anime_using_profile(&self, profile_name: &str) -> Result<Vec<Anime>> {
        self.anime_repo().get_using_profile(profile_name).await
    }

    pub async fn toggle_monitor(&self, id: i32, monitored: bool) -> Result<()> {
        self.anime_repo().toggle_monitor(id, monitored).await
    }

    pub async fn update_anime_path(&self, id: i32, path: &str) -> Result<()> {
        self.anime_repo().update_path(id, path).await
    }

    pub async fn update_anime_quality_profile(&self, id: i32, profile_id: i32) -> Result<()> {
        self.anime_repo()
            .update_quality_profile(id, profile_id)
            .await
    }

    pub async fn record_download(
        &self,
        anime_id: i32,
        filename: &str,
        episode: f32,
        group: Option<&str>,
        info_hash: Option<&str>,
    ) -> Result<()> {
        self.download_repo()
            .record(anime_id, filename, episode, group, info_hash)
            .await
    }

    pub async fn set_imported(&self, download_id: i64, imported: bool) -> Result<()> {
        self.download_repo()
            .set_imported(download_id, imported)
            .await
    }

    pub async fn get_download_by_hash(&self, hash: &str) -> Result<Option<DownloadEntry>> {
        self.download_repo().get_by_hash(hash).await
    }

    pub async fn get_downloads_by_hashes(&self, hashes: &[String]) -> Result<Vec<DownloadEntry>> {
        self.download_repo().get_by_hashes(hashes).await
    }

    pub async fn is_downloaded(&self, filename: &str) -> Result<bool> {
        self.download_repo().is_downloaded(filename).await
    }

    pub async fn get_downloads_for_anime(&self, anime_id: i32) -> Result<Vec<DownloadEntry>> {
        self.download_repo().get_for_anime(anime_id).await
    }

    pub async fn downloaded_episode_count(&self, anime_id: i32) -> Result<i32> {
        self.download_repo().episode_count(anime_id).await
    }

    pub async fn recent_downloads(&self, limit: i32) -> Result<Vec<DownloadEntry>> {
        self.download_repo().recent(limit).await
    }

    pub async fn add_to_blocklist(&self, info_hash: &str, reason: &str) -> Result<()> {
        self.download_repo()
            .add_to_blocklist(info_hash, reason)
            .await
    }

    pub async fn is_blocked(&self, info_hash: &str) -> Result<bool> {
        self.download_repo().is_blocked(info_hash).await
    }

    #[allow(clippy::too_many_arguments)]
    pub async fn add_to_recycle_bin(
        &self,
        original_path: &str,
        recycled_path: Option<&str>,
        anime_id: i32,
        episode_number: i32,
        quality_id: Option<i32>,
        file_size: Option<i64>,
        reason: &str,
    ) -> Result<i64> {
        self.download_repo()
            .add_to_recycle_bin(
                original_path,
                recycled_path,
                anime_id,
                episode_number,
                quality_id,
                file_size,
                reason,
            )
            .await
    }

    pub async fn get_old_recycle_entries(&self, older_than: &str) -> Result<Vec<RecycleBinEntry>> {
        self.download_repo()
            .get_old_recycle_entries(older_than)
            .await
    }

    pub async fn remove_from_recycle_bin(&self, id: i64) -> Result<()> {
        self.download_repo().remove_from_recycle_bin(id).await
    }

    pub async fn add_rss_feed(&self, anime_id: i32, url: &str, name: Option<&str>) -> Result<i64> {
        self.rss_repo().add(anime_id, url, name).await
    }

    pub async fn get_rss_feed(&self, id: i64) -> Result<Option<RssFeed>> {
        self.rss_repo().get(id).await
    }

    pub async fn get_rss_feeds_for_anime(&self, anime_id: i32) -> Result<Vec<RssFeed>> {
        self.rss_repo().get_for_anime(anime_id).await
    }

    pub async fn get_enabled_rss_feeds(&self) -> Result<Vec<RssFeed>> {
        self.rss_repo().get_enabled().await
    }

    pub async fn list_rss_feeds(&self) -> Result<Vec<RssFeed>> {
        self.rss_repo().list_all().await
    }

    pub async fn update_rss_feed_checked(
        &self,
        feed_id: i64,
        last_item_hash: Option<&str>,
    ) -> Result<()> {
        self.rss_repo()
            .update_checked(feed_id, last_item_hash)
            .await
    }

    pub async fn toggle_rss_feed(&self, feed_id: i64, enabled: bool) -> Result<bool> {
        self.rss_repo().toggle(feed_id, enabled).await
    }

    pub async fn remove_rss_feed(&self, feed_id: i64) -> Result<bool> {
        self.rss_repo().remove(feed_id).await
    }

    pub async fn rss_feed_count(&self, anime_id: i32) -> Result<i32> {
        self.rss_repo().count_for_anime(anime_id).await
    }

    pub async fn add_log(
        &self,
        event_type: &str,
        level: &str,
        message: &str,
        details: Option<String>,
    ) -> Result<()> {
        self.logs_repo()
            .add(event_type, level, message, details)
            .await
    }

    pub async fn get_logs(
        &self,
        page: u64,
        page_size: u64,
        level_filter: Option<String>,
        event_type_filter: Option<String>,
        start_date: Option<String>,
        end_date: Option<String>,
    ) -> Result<(Vec<SystemLog>, u64)> {
        self.logs_repo()
            .get_logs(
                page,
                page_size,
                level_filter,
                event_type_filter,
                start_date,
                end_date,
            )
            .await
    }

    pub async fn get_all_logs(
        &self,
        level_filter: Option<String>,
        event_type_filter: Option<String>,
        start_date: Option<String>,
        end_date: Option<String>,
    ) -> Result<Vec<SystemLog>> {
        self.logs_repo()
            .get_all_logs(level_filter, event_type_filter, start_date, end_date)
            .await
    }

    pub async fn clear_logs(&self) -> Result<()> {
        self.logs_repo().clear_logs().await
    }

    pub async fn prune_logs(&self, older_than_days: i64) -> Result<u64> {
        self.logs_repo().prune_logs(older_than_days).await
    }

    pub async fn get_latest_log_time(&self, event_type: &str) -> Result<Option<String>> {
        self.logs_repo().get_latest_event_time(event_type).await
    }

    pub async fn get_episode_title(
        &self,
        anime_id: i32,
        episode_number: i32,
    ) -> Result<Option<String>> {
        self.episode_repo()
            .get_title(anime_id, episode_number)
            .await
    }

    pub async fn get_episode_titles_batch(
        &self,
        pairs: &[(i32, i32)],
    ) -> Result<std::collections::HashMap<(i32, i32), String>> {
        self.episode_repo().get_titles_batch(pairs).await
    }

    pub async fn get_episode_metadata(
        &self,
        anime_id: i32,
        episode_number: i32,
    ) -> Result<Option<episode_metadata::Model>> {
        self.episode_repo()
            .get_metadata(anime_id, episode_number)
            .await
    }

    pub async fn get_episodes_for_anime(
        &self,
        anime_id: i32,
    ) -> Result<Vec<episode_metadata::Model>> {
        self.episode_repo().get_all_for_anime(anime_id).await
    }

    pub async fn has_cached_episodes(&self, anime_id: i32) -> Result<bool> {
        self.episode_repo().has_cached(anime_id).await
    }

    pub async fn cache_episode(&self, anime_id: i32, episode: &EpisodeInput) -> Result<()> {
        self.episode_repo().cache_one(anime_id, episode).await
    }

    pub async fn cache_episodes(&self, anime_id: i32, episodes: &[EpisodeInput]) -> Result<()> {
        self.episode_repo().cache_many(anime_id, episodes).await
    }

    pub async fn clear_episode_cache(&self, anime_id: i32) -> Result<()> {
        self.episode_repo().clear_cache(anime_id).await
    }

    pub async fn get_episode_status(
        &self,
        anime_id: i32,
        episode_number: i32,
    ) -> Result<Option<EpisodeStatusRow>> {
        self.episode_repo()
            .get_status(anime_id, episode_number)
            .await
    }

    pub async fn get_episode_statuses_batch(
        &self,
        pairs: &[(i32, i32)],
    ) -> Result<std::collections::HashMap<(i32, i32), EpisodeStatusRow>> {
        self.episode_repo().get_statuses_batch(pairs).await
    }

    pub async fn get_episode_statuses(&self, anime_id: i32) -> Result<Vec<EpisodeStatusRow>> {
        self.episode_repo().get_statuses(anime_id).await
    }

    pub async fn get_downloaded_count(&self, anime_id: i32) -> Result<i32> {
        self.episode_repo().get_downloaded_count(anime_id).await
    }

    pub async fn get_download_queue_count(&self) -> Result<i64> {
        self.episode_repo().get_download_queue_count().await
    }

    pub async fn get_download_counts_for_anime_ids(
        &self,
        anime_ids: &[i32],
    ) -> Result<std::collections::HashMap<i32, i32>> {
        self.episode_repo()
            .get_download_counts_for_anime_ids(anime_ids)
            .await
    }

    pub async fn get_downloaded_episodes_for_anime_ids(
        &self,
        anime_ids: &[i32],
    ) -> Result<std::collections::HashMap<i32, Vec<i32>>> {
        self.episode_repo()
            .get_downloaded_episodes_for_anime_ids(anime_ids)
            .await
    }

    pub async fn get_main_episode_download_counts(
        &self,
        anime_ids: &[i32],
    ) -> Result<std::collections::HashMap<i32, i32>> {
        self.episode_repo()
            .get_main_episode_download_counts(anime_ids)
            .await
    }

    pub async fn get_missing_episodes(
        &self,
        anime_id: i32,
        total_episodes: i32,
    ) -> Result<Vec<i32>> {
        self.episode_repo()
            .get_missing(anime_id, total_episodes)
            .await
    }

    pub async fn upsert_episode_status(&self, status: &EpisodeStatusInput) -> Result<()> {
        self.episode_repo().upsert_status(status).await
    }

    pub async fn get_calendar_events(
        &self,
        start_date: &str,
        end_date: &str,
    ) -> Result<Vec<CalendarEventRow>> {
        self.episode_repo()
            .get_calendar_events(start_date, end_date)
            .await
    }

    pub async fn get_missing_episode_numbers_for_anime(&self, anime_id: i32) -> Result<Vec<i32>> {
        self.episode_repo()
            .get_missing_episode_numbers_for_anime(anime_id)
            .await
    }

    pub async fn get_all_missing_episode_numbers_by_anime_id(
        &self,
        anime_ids: &[i32],
    ) -> Result<std::collections::HashMap<i32, Vec<i32>>> {
        self.episode_repo()
            .get_all_missing_episode_numbers_by_anime_id(anime_ids)
            .await
    }

    pub async fn get_total_missing_episodes_count(&self) -> Result<i64> {
        self.episode_repo().get_total_missing_episodes_count().await
    }

    pub async fn get_all_missing_episodes(&self, limit: u64) -> Result<Vec<MissingEpisodeRow>> {
        self.episode_repo().get_all_missing_episodes(limit).await
    }

    #[allow(clippy::too_many_arguments)]
    pub async fn mark_episode_downloaded(
        &self,
        anime_id: i32,
        episode_number: i32,
        season: i32,
        quality_id: i32,
        is_seadex: bool,
        file_path: &str,
        file_size: Option<i64>,
        media_info: Option<&MediaInfo>,
    ) -> Result<()> {
        self.episode_repo()
            .mark_downloaded(
                anime_id,
                episode_number,
                season,
                quality_id,
                is_seadex,
                file_path,
                file_size,
                media_info,
            )
            .await
    }

    pub async fn clear_episode_download(&self, anime_id: i32, episode_number: i32) -> Result<()> {
        self.episode_repo()
            .clear_download(anime_id, episode_number)
            .await
    }

    pub async fn update_episode_path(
        &self,
        anime_id: i32,
        episode_number: i32,
        new_path: &str,
    ) -> Result<()> {
        self.episode_repo()
            .update_path(anime_id, episode_number, new_path)
            .await
    }

    pub async fn update_episode_media_info(
        &self,
        anime_id: i32,
        episode_number: i32,
        media_info: &MediaInfo,
    ) -> Result<()> {
        self.episode_repo()
            .update_media_info(anime_id, episode_number, media_info)
            .await
    }

    pub async fn get_seadex_cache(&self, anime_id: i32) -> Result<Option<SeaDexCache>> {
        self.cache_repo().get_seadex(anime_id).await
    }

    pub async fn cache_seadex(
        &self,
        anime_id: i32,
        groups: &[String],
        best_release: Option<&str>,
        releases: &[SeaDexRelease],
    ) -> Result<()> {
        self.cache_repo()
            .set_seadex(anime_id, groups, best_release, releases)
            .await
    }

    pub async fn is_seadex_cache_fresh(&self, anime_id: i32) -> Result<bool> {
        self.cache_repo().is_seadex_fresh(anime_id).await
    }

    pub async fn get_cached_search(&self, query: &str) -> Result<Option<Vec<SearchResult>>> {
        self.cache_repo().get_cached_search(query).await
    }

    pub async fn cache_search_results(&self, query: &str, results: &[SearchResult]) -> Result<()> {
        self.cache_repo().cache_search_results(query, results).await
    }

    pub async fn get_quality_profile(&self, id: i32) -> Result<Option<QualityProfileRow>> {
        self.quality_repo().get_profile(id).await
    }

    pub async fn get_quality_profile_by_name(
        &self,
        name: &str,
    ) -> Result<Option<QualityProfileRow>> {
        self.quality_repo().get_profile_by_name(name).await
    }

    pub async fn get_profile_allowed_qualities(&self, profile_id: i32) -> Result<Vec<i32>> {
        self.quality_repo().get_allowed_qualities(profile_id).await
    }

    pub async fn sync_profiles(&self, profiles: &[QualityProfileConfig]) -> Result<()> {
        self.quality_repo().sync_profiles(profiles).await
    }

    pub async fn list_release_profiles(
        &self,
    ) -> Result<
        Vec<(
            crate::entities::release_profiles::Model,
            Vec<crate::entities::release_profile_rules::Model>,
        )>,
    > {
        self.release_profile_repo().list_profiles().await
    }

    pub async fn get_enabled_release_rules(
        &self,
    ) -> Result<Vec<crate::entities::release_profile_rules::Model>> {
        self.release_profile_repo().get_enabled_rules().await
    }

    pub async fn get_release_rules_for_anime(
        &self,
        anime_id: i32,
    ) -> Result<Vec<crate::entities::release_profile_rules::Model>> {
        self.release_profile_repo()
            .get_rules_for_anime(anime_id)
            .await
    }

    pub async fn assign_release_profiles_to_anime(
        &self,
        anime_id: i32,
        profile_ids: &[i32],
    ) -> Result<()> {
        self.release_profile_repo()
            .assign_profiles_to_anime(anime_id, profile_ids)
            .await
    }

    pub async fn get_assigned_release_profile_ids(&self, anime_id: i32) -> Result<Vec<i32>> {
        self.release_profile_repo()
            .get_assigned_profile_ids(anime_id)
            .await
    }

    pub async fn get_assigned_release_profiles_for_anime_ids(
        &self,
        anime_ids: &[i32],
    ) -> Result<std::collections::HashMap<i32, Vec<i32>>> {
        self.release_profile_repo()
            .get_assigned_profiles_for_anime_ids(anime_ids)
            .await
    }

    pub async fn create_release_profile(
        &self,
        name: String,
        enabled: bool,
        is_global: bool,
        rules: Vec<repositories::release_profile::ReleaseProfileRuleDto>,
    ) -> Result<crate::entities::release_profiles::Model> {
        self.release_profile_repo()
            .create_profile(name, enabled, is_global, rules)
            .await
    }

    pub async fn update_release_profile(
        &self,
        id: i32,
        name: String,
        enabled: bool,
        is_global: bool,
        rules: Vec<repositories::release_profile::ReleaseProfileRuleDto>,
    ) -> Result<()> {
        self.release_profile_repo()
            .update_profile(id, name, enabled, is_global, rules)
            .await
    }

    pub async fn delete_release_profile(&self, id: i32) -> Result<()> {
        self.release_profile_repo().delete_profile(id).await
    }

    // ========== Anime Metadata Repository Methods ==========

    pub async fn is_anime_metadata_empty(&self) -> Result<bool> {
        self.anime_metadata_repo().is_empty().await
    }

    pub async fn batch_insert_anime_metadata(
        &self,
        entries: Vec<crate::entities::anime_metadata::ActiveModel>,
    ) -> Result<()> {
        self.anime_metadata_repo().batch_insert(entries).await
    }

    pub async fn get_anime_metadata_by_anilist_id(
        &self,
        anilist_id: i32,
    ) -> Result<Option<crate::entities::anime_metadata::Model>> {
        self.anime_metadata_repo()
            .get_by_anilist_id(anilist_id)
            .await
    }

    pub async fn get_anime_metadata_by_mal_id(
        &self,
        mal_id: i32,
    ) -> Result<Option<crate::entities::anime_metadata::Model>> {
        self.anime_metadata_repo().get_by_mal_id(mal_id).await
    }

    pub async fn clear_anime_metadata(&self) -> Result<()> {
        self.anime_metadata_repo().clear().await
    }

    // ========== User Repository Methods ==========

    #[must_use]
    pub fn user_repo(&self) -> repositories::user::UserRepository {
        repositories::user::UserRepository::new(self.conn.clone())
    }

    pub async fn get_user_by_username(
        &self,
        username: &str,
    ) -> Result<Option<repositories::user::User>> {
        self.user_repo().get_by_username(username).await
    }

    pub async fn get_user_by_username_with_password(
        &self,
        username: &str,
    ) -> Result<Option<(repositories::user::User, String)>> {
        self.user_repo()
            .get_by_username_with_password(username)
            .await
    }

    pub async fn verify_user_password(&self, username: &str, password: &str) -> Result<bool> {
        self.user_repo().verify_password(username, password).await
    }

    pub async fn update_user_password(&self, username: &str, new_password: &str) -> Result<()> {
        self.user_repo()
            .update_password(username, new_password)
            .await
    }

    pub async fn update_user_password_with_config(
        &self,
        username: &str,
        new_password: &str,
        config: &crate::config::SecurityConfig,
    ) -> Result<()> {
        self.user_repo()
            .update_password_with_config(username, new_password, config)
            .await
    }

    pub async fn verify_api_key(&self, api_key: &str) -> Result<Option<repositories::user::User>> {
        self.user_repo().verify_api_key(api_key).await
    }

    pub async fn get_user_api_key(&self, username: &str) -> Result<Option<String>> {
        self.user_repo().get_api_key(username).await
    }

    pub async fn regenerate_user_api_key(&self, username: &str) -> Result<String> {
        self.user_repo().regenerate_api_key(username).await
    }
}
