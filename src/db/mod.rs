use crate::clients::seadex::SeaDexRelease;
use crate::models::anime::{Anime, AnimeTitle};
use crate::models::media::MediaInfo;
use anyhow::Result;
use sea_orm::{
    ColumnTrait, Database, DatabaseConnection, EntityTrait, FromQueryResult, JoinType,
    PaginatorTrait, QueryFilter, QueryOrder, QuerySelect, RelationTrait, Set, TransactionTrait,
};
use std::path::Path;
use tracing::info;

use crate::entities::{prelude::*, *};

pub mod migrator;

#[derive(Clone)]
pub struct Store {
    pub conn: DatabaseConnection,
}

#[derive(Debug, Clone)]
pub struct AnimeRow {
    pub id: i64,
    pub romaji_title: String,
    pub english_title: Option<String>,
    pub native_title: Option<String>,
    pub format: String,
    pub episode_count: Option<i64>,
    pub status: String,
    pub quality_profile_id: Option<i32>,
    pub cover_image: Option<String>,
    pub banner_image: Option<String>,
    pub created_at: String,
    pub profile_name: Option<String>,
    pub path: Option<String>,
    pub mal_id: Option<i64>,
    pub description: Option<String>,
    pub score: Option<f32>,
    pub genres: Option<String>,
    pub studios: Option<String>,
    pub start_year: Option<i64>,
    pub monitored: bool,
}

impl From<monitored_anime::Model> for AnimeRow {
    fn from(model: monitored_anime::Model) -> Self {
        Self {
            id: model.id as i64,
            romaji_title: model.romaji_title,
            english_title: model.english_title,
            native_title: model.native_title,
            format: model.format,
            episode_count: model.episode_count.map(|c| c as i64),
            status: model.status,
            quality_profile_id: model.quality_profile_id,
            cover_image: model.cover_image,
            banner_image: model.banner_image,
            created_at: model.created_at.unwrap_or_default(),
            profile_name: None,
            path: model.path,
            mal_id: model.mal_id.map(|i| i as i64),
            description: model.description,
            score: model.score,
            genres: model.genres,
            studios: model.studios,
            start_year: model.start_year.map(|y| y as i64),
            monitored: model.monitored,
        }
    }
}

impl From<AnimeRow> for Anime {
    fn from(row: AnimeRow) -> Self {
        Anime {
            id: row.id as i32,
            title: AnimeTitle {
                romaji: row.romaji_title,
                english: row.english_title,
                native: row.native_title,
            },
            format: row.format,
            episode_count: row.episode_count.map(|c| c as i32),
            status: row.status,
            quality_profile_id: row.quality_profile_id,
            cover_image: row.cover_image,
            banner_image: row.banner_image,
            added_at: row.created_at,
            profile_name: row.profile_name,
            path: row.path,
            mal_id: row.mal_id.map(|id| id as i32),
            description: row.description,
            score: row.score,
            genres: row.genres.and_then(|s| serde_json::from_str(&s).ok()),
            studios: row.studios.and_then(|s| serde_json::from_str(&s).ok()),
            start_year: row.start_year.map(|y| y as i32),
            monitored: row.monitored,
        }
    }
}

#[derive(Debug, Clone)]
pub struct DownloadEntry {
    pub id: i64,
    pub anime_id: i32,
    pub filename: String,
    pub episode_number: f32,
    pub group_name: Option<String>,
    pub download_date: String,
    pub info_hash: Option<String>,
    pub imported: bool,
}

#[derive(Debug, Clone, FromQueryResult)]
pub struct CalendarEventRow {
    pub anime_id: i64,
    pub anime_title: String,
    pub episode_number: i64,
    pub episode_title: Option<String>,
    pub aired: Option<String>,
    pub downloaded: bool,
    pub anime_image: Option<String>,
}

impl Store {
    pub async fn new(db_url: &str) -> Result<Self> {
        if !db_url.starts_with(":memory:") {
            let path_str = db_url.trim_start_matches("sqlite:");
            if let Some(parent) = Path::new(path_str).parent() {
                tokio::fs::create_dir_all(parent).await.ok();
            }
            if !Path::new(path_str).exists() {
                std::fs::File::create(path_str)?;
            }
        }

        let conn = Database::connect(db_url).await?;

        use sea_orm_migration::MigratorTrait;
        migrator::Migrator::up(&conn, None).await?;

        info!("Database connected & migrations applied");

        Ok(Self { conn })
    }

    pub async fn initialize_quality_system(&self, config: &crate::config::Config) -> Result<()> {
        use crate::quality::QUALITIES;

        for q in QUALITIES.iter() {
            let active_model = quality_definitions::ActiveModel {
                id: Set(q.id),
                name: Set(q.name.clone()),
                source: Set(q.source.as_str().to_string()),
                resolution: Set(q.resolution as i32),
                rank: Set(q.rank),
            };

            QualityDefinitions::insert(active_model)
                .on_conflict(
                    sea_orm::sea_query::OnConflict::column(quality_definitions::Column::Id)
                        .update_columns([
                            quality_definitions::Column::Name,
                            quality_definitions::Column::Source,
                            quality_definitions::Column::Resolution,
                            quality_definitions::Column::Rank,
                        ])
                        .to_owned(),
                )
                .exec(&self.conn)
                .await?;
        }

        for profile_config in &config.profiles {
            let cutoff_quality = crate::quality::get_quality_by_name(&profile_config.cutoff)
                .or_else(|| crate::quality::get_quality_by_name("BluRay 1080p"))
                .unwrap_or(QUALITIES[0].clone());

            let active_profile = quality_profiles::ActiveModel {
                name: Set(profile_config.name.clone()),
                cutoff_quality_id: Set(cutoff_quality.id),
                upgrade_allowed: Set(profile_config.upgrade_allowed),
                seadex_preferred: Set(profile_config.seadex_preferred),
                ..Default::default()
            };

            QualityProfiles::insert(active_profile)
                .on_conflict(
                    sea_orm::sea_query::OnConflict::column(quality_profiles::Column::Name)
                        .update_columns([
                            quality_profiles::Column::CutoffQualityId,
                            quality_profiles::Column::UpgradeAllowed,
                            quality_profiles::Column::SeadexPreferred,
                        ])
                        .to_owned(),
                )
                .exec(&self.conn)
                .await?;

            let profile_model = QualityProfiles::find()
                .filter(quality_profiles::Column::Name.eq(&profile_config.name))
                .one(&self.conn)
                .await?
                .ok_or_else(|| anyhow::anyhow!("Failed to save profile"))?;

            let profile_id = profile_model.id;

            QualityProfileItems::delete_many()
                .filter(quality_profile_items::Column::ProfileId.eq(profile_id))
                .exec(&self.conn)
                .await?;

            let parsed_allowed: Vec<i32> = profile_config
                .allowed_qualities
                .iter()
                .filter_map(|name| crate::quality::get_quality_by_name(name))
                .map(|q| q.id)
                .collect();

            if !parsed_allowed.is_empty() {
                let items: Vec<quality_profile_items::ActiveModel> = parsed_allowed
                    .into_iter()
                    .map(|qid| quality_profile_items::ActiveModel {
                        profile_id: Set(profile_id),
                        quality_id: Set(qid),
                        allowed: Set(true),
                    })
                    .collect();

                QualityProfileItems::insert_many(items)
                    .exec(&self.conn)
                    .await?;
            }
        }

        info!("Quality definitions and profiles initialized");
        Ok(())
    }

    pub async fn add_anime(&self, anime: &Anime) -> Result<()> {
        let profile_id = anime.quality_profile_id.unwrap_or(1);

        let active_model = monitored_anime::ActiveModel {
            id: Set(anime.id),
            romaji_title: Set(anime.title.romaji.clone()),
            english_title: Set(anime.title.english.clone()),
            native_title: Set(anime.title.native.clone()),
            format: Set(anime.format.clone()),
            episode_count: Set(anime.episode_count),
            status: Set(anime.status.clone()),
            quality_profile_id: Set(Some(profile_id)),
            cover_image: Set(anime.cover_image.clone()),
            banner_image: Set(anime.banner_image.clone()),
            path: Set(anime.path.clone()),
            mal_id: Set(anime.mal_id),
            description: Set(anime.description.clone()),
            score: Set(anime.score),
            genres: Set(anime
                .genres
                .as_ref()
                .map(|g| serde_json::to_string(g).unwrap_or_default())),
            studios: Set(anime
                .studios
                .as_ref()
                .map(|s| serde_json::to_string(s).unwrap_or_default())),
            start_year: Set(anime.start_year),
            monitored: Set(anime.monitored),
            ..Default::default()
        };

        MonitoredAnime::insert(active_model)
            .on_conflict(
                sea_orm::sea_query::OnConflict::column(monitored_anime::Column::Id)
                    .update_columns([
                        monitored_anime::Column::Status,
                        monitored_anime::Column::EpisodeCount,
                        monitored_anime::Column::QualityProfileId,
                        monitored_anime::Column::CoverImage,
                        monitored_anime::Column::BannerImage,
                        monitored_anime::Column::Path,
                        monitored_anime::Column::MalId,
                        monitored_anime::Column::Description,
                        monitored_anime::Column::Score,
                        monitored_anime::Column::Genres,
                        monitored_anime::Column::Studios,
                        monitored_anime::Column::StartYear,
                        monitored_anime::Column::Monitored,
                    ])
                    .to_owned(),
            )
            .exec(&self.conn)
            .await?;

        info!("Added/Updated anime: {}", anime.title.romaji);
        Ok(())
    }

    pub async fn get_anime(&self, id: i32) -> Result<Option<Anime>> {
        let result = MonitoredAnime::find_by_id(id)
            .find_also_related(QualityProfiles)
            .one(&self.conn)
            .await?;

        Ok(result.map(|(anime, profile)| Anime {
            id: anime.id,
            title: AnimeTitle {
                romaji: anime.romaji_title,
                english: anime.english_title,
                native: anime.native_title,
            },
            format: anime.format,
            episode_count: anime.episode_count,
            status: anime.status,
            quality_profile_id: anime.quality_profile_id,
            cover_image: anime.cover_image,
            banner_image: anime.banner_image,
            added_at: anime.created_at.unwrap_or_default(),
            profile_name: profile.map(|p| p.name),
            path: anime.path,
            mal_id: anime.mal_id,
            description: anime.description,
            score: anime.score,
            genres: anime.genres.and_then(|s| serde_json::from_str(&s).ok()),
            studios: anime.studios.and_then(|s| serde_json::from_str(&s).ok()),
            start_year: anime.start_year,
            monitored: anime.monitored,
        }))
    }

    pub async fn list_monitored(&self) -> Result<Vec<Anime>> {
        let rows = MonitoredAnime::find()
            .filter(monitored_anime::Column::Monitored.eq(true))
            .order_by_asc(monitored_anime::Column::RomajiTitle)
            .find_also_related(QualityProfiles)
            .all(&self.conn)
            .await?;

        Ok(rows
            .into_iter()
            .map(|(anime, profile)| Anime {
                id: anime.id,
                title: AnimeTitle {
                    romaji: anime.romaji_title,
                    english: anime.english_title,
                    native: anime.native_title,
                },
                format: anime.format,
                episode_count: anime.episode_count,
                status: anime.status,
                quality_profile_id: anime.quality_profile_id,
                cover_image: anime.cover_image,
                banner_image: anime.banner_image,
                added_at: anime.created_at.unwrap_or_default(),
                profile_name: profile.map(|p| p.name),
                path: anime.path,
                mal_id: anime.mal_id,
                description: anime.description,
                score: anime.score,
                genres: anime.genres.and_then(|s| serde_json::from_str(&s).ok()),
                studios: anime.studios.and_then(|s| serde_json::from_str(&s).ok()),
                start_year: anime.start_year,
                monitored: anime.monitored,
            })
            .collect())
    }

    pub async fn list_all_anime(&self) -> Result<Vec<Anime>> {
        let rows = MonitoredAnime::find()
            .order_by_asc(monitored_anime::Column::RomajiTitle)
            .find_also_related(QualityProfiles)
            .all(&self.conn)
            .await?;

        Ok(rows
            .into_iter()
            .map(|(anime, profile)| Anime {
                id: anime.id,
                title: AnimeTitle {
                    romaji: anime.romaji_title,
                    english: anime.english_title,
                    native: anime.native_title,
                },
                format: anime.format,
                episode_count: anime.episode_count,
                status: anime.status,
                quality_profile_id: anime.quality_profile_id,
                cover_image: anime.cover_image,
                banner_image: anime.banner_image,
                added_at: anime.created_at.unwrap_or_default(),
                profile_name: profile.map(|p| p.name),
                path: anime.path,
                mal_id: anime.mal_id,
                description: anime.description,
                score: anime.score,
                genres: anime.genres.and_then(|s| serde_json::from_str(&s).ok()),
                studios: anime.studios.and_then(|s| serde_json::from_str(&s).ok()),
                start_year: anime.start_year,
                monitored: anime.monitored,
            })
            .collect())
    }

    pub async fn remove_anime(&self, id: i32) -> Result<bool> {
        let txn = self.conn.begin().await?;

        ReleaseHistory::delete_many()
            .filter(release_history::Column::AnimeId.eq(id))
            .exec(&txn)
            .await?;

        let result = MonitoredAnime::delete_by_id(id).exec(&txn).await?;

        txn.commit().await?;

        let removed = result.rows_affected > 0;
        if removed {
            info!("Removed anime with ID: {}", id);
        }
        Ok(removed)
    }

    pub async fn record_download(
        &self,
        anime_id: i32,
        filename: &str,
        episode: f32,
        group: Option<&str>,
        info_hash: Option<&str>,
    ) -> Result<()> {
        let active_model = release_history::ActiveModel {
            anime_id: Set(anime_id),
            filename: Set(filename.to_string()),
            episode_number: Set(episode),
            group_name: Set(group.map(|s| s.to_string())),
            info_hash: Set(info_hash.map(|s| s.to_string())),
            download_date: Set(Some(chrono::Utc::now().to_rfc3339())),
            imported: Set(false),
            ..Default::default()
        };

        ReleaseHistory::insert(active_model)
            .on_conflict(
                sea_orm::sea_query::OnConflict::column(release_history::Column::Filename)
                    .do_nothing()
                    .to_owned(),
            )
            .exec(&self.conn)
            .await?;

        Ok(())
    }

    pub async fn set_imported(&self, download_id: i64, imported: bool) -> Result<()> {
        ReleaseHistory::update_many()
            .col_expr(
                release_history::Column::Imported,
                sea_orm::sea_query::Expr::value(imported),
            )
            .filter(release_history::Column::Id.eq(download_id as i32))
            .exec(&self.conn)
            .await?;
        Ok(())
    }

    pub async fn get_download_by_hash(&self, hash: &str) -> Result<Option<DownloadEntry>> {
        let result = ReleaseHistory::find()
            .filter(release_history::Column::InfoHash.eq(hash))
            .one(&self.conn)
            .await?;

        Ok(result.map(|r| DownloadEntry {
            id: r.id as i64,
            anime_id: r.anime_id,
            filename: r.filename,
            episode_number: r.episode_number,
            group_name: r.group_name,
            download_date: r.download_date.unwrap_or_default(),
            info_hash: r.info_hash,
            imported: r.imported,
        }))
    }

    pub async fn is_downloaded(&self, filename: &str) -> Result<bool> {
        let count = ReleaseHistory::find()
            .filter(release_history::Column::Filename.eq(filename))
            .count(&self.conn)
            .await?;

        Ok(count > 0)
    }

    pub async fn get_downloads_for_anime(&self, anime_id: i32) -> Result<Vec<DownloadEntry>> {
        let rows = ReleaseHistory::find()
            .filter(release_history::Column::AnimeId.eq(anime_id))
            .order_by_asc(release_history::Column::EpisodeNumber)
            .all(&self.conn)
            .await?;

        Ok(rows
            .into_iter()
            .map(|r| DownloadEntry {
                id: r.id as i64,
                anime_id: r.anime_id,
                filename: r.filename,
                episode_number: r.episode_number,
                group_name: r.group_name,
                download_date: r.download_date.unwrap_or_default(),
                info_hash: r.info_hash,
                imported: r.imported,
            })
            .collect())
    }

    pub async fn downloaded_episode_count(&self, anime_id: i32) -> Result<i32> {
        let count = ReleaseHistory::find()
            .filter(release_history::Column::AnimeId.eq(anime_id))
            .select_only()
            .column(release_history::Column::EpisodeNumber)
            .distinct()
            .count(&self.conn)
            .await?;

        Ok(count as i32)
    }

    pub async fn recent_downloads(&self, limit: i32) -> Result<Vec<DownloadEntry>> {
        let rows = ReleaseHistory::find()
            .order_by_desc(release_history::Column::DownloadDate)
            .limit(limit as u64)
            .all(&self.conn)
            .await?;

        Ok(rows
            .into_iter()
            .map(|r| DownloadEntry {
                id: r.id as i64,
                anime_id: r.anime_id,
                filename: r.filename,
                episode_number: r.episode_number,
                group_name: r.group_name,
                download_date: r.download_date.unwrap_or_default(),
                info_hash: r.info_hash,
                imported: r.imported,
            })
            .collect())
    }

    pub async fn add_rss_feed(&self, anime_id: i32, url: &str, name: Option<&str>) -> Result<i64> {
        let active_model = rss_feeds::ActiveModel {
            anime_id: Set(anime_id),
            url: Set(url.to_string()),
            name: Set(name.map(|s| s.to_string())),
            enabled: Set(true),
            ..Default::default()
        };

        let res = RssFeeds::insert(active_model).exec(&self.conn).await?;
        info!("Added RSS feed for anime {}: {}", anime_id, url);
        Ok(res.last_insert_id as i64)
    }

    pub async fn get_rss_feeds_for_anime(&self, anime_id: i32) -> Result<Vec<RssFeed>> {
        let rows = RssFeeds::find()
            .filter(rss_feeds::Column::AnimeId.eq(anime_id))
            .order_by_asc(rss_feeds::Column::CreatedAt)
            .all(&self.conn)
            .await?;

        Ok(rows
            .into_iter()
            .map(|r| RssFeed {
                id: r.id as i64,
                anime_id: r.anime_id,
                url: r.url,
                name: r.name,
                last_checked: r.last_checked,
                last_item_hash: r.last_item_hash,
                enabled: r.enabled,
                created_at: r.created_at.unwrap_or_default(),
            })
            .collect())
    }

    pub async fn get_enabled_rss_feeds(&self) -> Result<Vec<RssFeed>> {
        let rows = RssFeeds::find()
            .filter(rss_feeds::Column::Enabled.eq(true))
            .order_by_asc(rss_feeds::Column::LastChecked)
            .all(&self.conn)
            .await?;

        Ok(rows
            .into_iter()
            .map(|r| RssFeed {
                id: r.id as i64,
                anime_id: r.anime_id,
                url: r.url,
                name: r.name,
                last_checked: r.last_checked,
                last_item_hash: r.last_item_hash,
                enabled: r.enabled,
                created_at: r.created_at.unwrap_or_default(),
            })
            .collect())
    }

    pub async fn get_rss_feed(&self, id: i64) -> Result<Option<RssFeed>> {
        let result = RssFeeds::find_by_id(id as i32).one(&self.conn).await?;

        Ok(result.map(|r| RssFeed {
            id: r.id as i64,
            anime_id: r.anime_id,
            url: r.url,
            name: r.name,
            last_checked: r.last_checked,
            last_item_hash: r.last_item_hash,
            enabled: r.enabled,
            created_at: r.created_at.unwrap_or_default(),
        }))
    }

    pub async fn update_rss_feed_checked(
        &self,
        feed_id: i64,
        last_item_hash: Option<&str>,
    ) -> Result<()> {
        let mut update = RssFeeds::update_many()
            .col_expr(
                rss_feeds::Column::LastChecked,
                sea_orm::sea_query::Expr::current_timestamp().into(),
            )
            .filter(rss_feeds::Column::Id.eq(feed_id as i32));

        if let Some(hash) = last_item_hash {
            update = update.col_expr(
                rss_feeds::Column::LastItemHash,
                sea_orm::sea_query::Expr::value(hash),
            );
        }

        update.exec(&self.conn).await?;

        Ok(())
    }

    pub async fn toggle_rss_feed(&self, feed_id: i64, enabled: bool) -> Result<bool> {
        let result = RssFeeds::update_many()
            .col_expr(
                rss_feeds::Column::Enabled,
                sea_orm::sea_query::Expr::value(enabled),
            )
            .filter(rss_feeds::Column::Id.eq(feed_id as i32))
            .exec(&self.conn)
            .await?;

        Ok(result.rows_affected > 0)
    }

    pub async fn remove_rss_feed(&self, feed_id: i64) -> Result<bool> {
        let result = RssFeeds::delete_by_id(feed_id as i32)
            .exec(&self.conn)
            .await?;
        Ok(result.rows_affected > 0)
    }

    pub async fn rss_feed_count(&self, anime_id: i32) -> Result<i32> {
        let count = RssFeeds::find()
            .filter(rss_feeds::Column::AnimeId.eq(anime_id))
            .count(&self.conn)
            .await?;

        Ok(count as i32)
    }

    pub async fn get_episode_title(
        &self,
        anime_id: i32,
        episode_number: i32,
    ) -> Result<Option<String>> {
        let result = EpisodeMetadata::find()
            .filter(episode_metadata::Column::AnimeId.eq(anime_id))
            .filter(episode_metadata::Column::EpisodeNumber.eq(episode_number))
            .one(&self.conn)
            .await?;

        Ok(result.and_then(|m| m.title))
    }

    pub async fn get_episode_metadata(
        &self,
        anime_id: i32,
        episode_number: i32,
    ) -> Result<Option<episode_metadata::Model>> {
        let result = EpisodeMetadata::find()
            .filter(episode_metadata::Column::AnimeId.eq(anime_id))
            .filter(episode_metadata::Column::EpisodeNumber.eq(episode_number))
            .one(&self.conn)
            .await?;

        Ok(result)
    }

    pub async fn get_episodes_for_anime(
        &self,
        anime_id: i32,
    ) -> Result<Vec<episode_metadata::Model>> {
        let rows = EpisodeMetadata::find()
            .filter(episode_metadata::Column::AnimeId.eq(anime_id))
            .order_by_asc(episode_metadata::Column::EpisodeNumber)
            .all(&self.conn)
            .await?;

        Ok(rows)
    }

    pub async fn has_cached_episodes(&self, anime_id: i32) -> Result<bool> {
        let count = EpisodeMetadata::find()
            .filter(episode_metadata::Column::AnimeId.eq(anime_id))
            .count(&self.conn)
            .await?;

        Ok(count > 0)
    }

    pub async fn cache_episode(&self, anime_id: i32, episode: &EpisodeInput) -> Result<()> {
        let active_model = episode_metadata::ActiveModel {
            anime_id: Set(anime_id),
            episode_number: Set(episode.episode_number),
            title: Set(episode.title.clone()),
            title_japanese: Set(episode.title_japanese.clone()),
            aired: Set(episode.aired.clone()),
            filler: Set(episode.filler),
            recap: Set(episode.recap),
            fetched_at: Set(chrono::Utc::now().to_rfc3339()),
        };

        EpisodeMetadata::insert(active_model)
            .on_conflict(
                sea_orm::sea_query::OnConflict::columns([
                    episode_metadata::Column::AnimeId,
                    episode_metadata::Column::EpisodeNumber,
                ])
                .update_columns([
                    episode_metadata::Column::Title,
                    episode_metadata::Column::TitleJapanese,
                    episode_metadata::Column::Aired,
                    episode_metadata::Column::Filler,
                    episode_metadata::Column::Recap,
                    episode_metadata::Column::FetchedAt,
                ])
                .to_owned(),
            )
            .exec(&self.conn)
            .await?;

        Ok(())
    }

    pub async fn cache_episodes(&self, anime_id: i32, episodes: &[EpisodeInput]) -> Result<()> {
        if episodes.is_empty() {
            return Ok(());
        }

        let active_models: Vec<episode_metadata::ActiveModel> = episodes
            .iter()
            .map(|episode| episode_metadata::ActiveModel {
                anime_id: Set(anime_id),
                episode_number: Set(episode.episode_number),
                title: Set(episode.title.clone()),
                title_japanese: Set(episode.title_japanese.clone()),
                aired: Set(episode.aired.clone()),
                filler: Set(episode.filler),
                recap: Set(episode.recap),
                fetched_at: Set(chrono::Utc::now().to_rfc3339()),
            })
            .collect();

        EpisodeMetadata::insert_many(active_models)
            .on_conflict(
                sea_orm::sea_query::OnConflict::columns([
                    episode_metadata::Column::AnimeId,
                    episode_metadata::Column::EpisodeNumber,
                ])
                .update_columns([
                    episode_metadata::Column::Title,
                    episode_metadata::Column::TitleJapanese,
                    episode_metadata::Column::Aired,
                    episode_metadata::Column::Filler,
                    episode_metadata::Column::Recap,
                    episode_metadata::Column::FetchedAt,
                ])
                .to_owned(),
            )
            .exec(&self.conn)
            .await?;

        Ok(())
    }

    pub async fn clear_episode_cache(&self, anime_id: i32) -> Result<()> {
        EpisodeMetadata::delete_many()
            .filter(episode_metadata::Column::AnimeId.eq(anime_id))
            .exec(&self.conn)
            .await?;
        Ok(())
    }

    pub async fn get_episode_status(
        &self,
        anime_id: i32,
        episode_number: i32,
    ) -> Result<Option<EpisodeStatusRow>> {
        let row = EpisodeStatus::find()
            .filter(episode_status::Column::AnimeId.eq(anime_id))
            .filter(episode_status::Column::EpisodeNumber.eq(episode_number))
            .one(&self.conn)
            .await?;

        Ok(row.map(|m| EpisodeStatusRow {
            anime_id: m.anime_id,
            episode_number: m.episode_number,
            season: m.season,
            monitored: m.monitored,
            file_path: m.file_path,
            quality_id: m.quality_id,
            file_size: m.file_size,
            downloaded_at: m.downloaded_at,
            is_seadex: m.is_seadex,
            resolution_width: m.resolution_width,
            resolution_height: m.resolution_height,
            video_codec: m.video_codec,
            audio_codecs: m
                .audio_codecs
                .map(|s| serde_json::from_str(&s).unwrap_or_default()),
            duration_secs: m.duration_secs,
        }))
    }

    pub async fn get_episode_statuses(&self, anime_id: i32) -> Result<Vec<EpisodeStatusRow>> {
        let rows = EpisodeStatus::find()
            .filter(episode_status::Column::AnimeId.eq(anime_id))
            .order_by_asc(episode_status::Column::EpisodeNumber)
            .all(&self.conn)
            .await?;

        Ok(rows
            .into_iter()
            .map(|m| EpisodeStatusRow {
                anime_id: m.anime_id,
                episode_number: m.episode_number,
                season: m.season,
                monitored: m.monitored,
                file_path: m.file_path,
                quality_id: m.quality_id,
                file_size: m.file_size,
                downloaded_at: m.downloaded_at,
                is_seadex: m.is_seadex,
                resolution_width: m.resolution_width,
                resolution_height: m.resolution_height,
                video_codec: m.video_codec,
                audio_codecs: m
                    .audio_codecs
                    .map(|s| serde_json::from_str(&s).unwrap_or_default()),
                duration_secs: m.duration_secs,
            })
            .collect())
    }

    pub async fn get_downloaded_count(&self, anime_id: i32) -> Result<i32> {
        let count = EpisodeStatus::find()
            .filter(episode_status::Column::AnimeId.eq(anime_id))
            .filter(episode_status::Column::FilePath.is_not_null())
            .count(&self.conn)
            .await?;

        Ok(count as i32)
    }

    pub async fn get_download_queue_count(&self) -> Result<i64> {
        Ok(0)
    }

    pub async fn get_download_counts_for_anime_ids(
        &self,
        anime_ids: &[i32],
    ) -> Result<std::collections::HashMap<i32, i32>> {
        if anime_ids.is_empty() {
            return Ok(std::collections::HashMap::new());
        }

        let results: Vec<(i32, i64)> = EpisodeStatus::find()
            .select_only()
            .column(episode_status::Column::AnimeId)
            .column_as(episode_status::Column::AnimeId.count(), "count")
            .filter(episode_status::Column::AnimeId.is_in(anime_ids.to_vec()))
            .filter(episode_status::Column::FilePath.is_not_null())
            .group_by(episode_status::Column::AnimeId)
            .into_tuple()
            .all(&self.conn)
            .await?;

        let mut map = std::collections::HashMap::new();
        for (id, count) in results {
            map.insert(id, count as i32);
        }

        Ok(map)
    }

    pub async fn get_missing_episodes(
        &self,
        anime_id: i32,
        total_episodes: i32,
    ) -> Result<Vec<i32>> {
        let downloaded: Vec<i32> = EpisodeStatus::find()
            .select_only()
            .column(episode_status::Column::EpisodeNumber)
            .filter(episode_status::Column::AnimeId.eq(anime_id))
            .filter(episode_status::Column::FilePath.is_not_null())
            .into_tuple()
            .all(&self.conn)
            .await?;

        let missing: Vec<i32> = (1..=total_episodes)
            .filter(|ep| !downloaded.contains(ep))
            .collect();

        Ok(missing)
    }

    pub async fn upsert_episode_status(&self, status: &EpisodeStatusInput) -> Result<()> {
        let active_model = episode_status::ActiveModel {
            anime_id: Set(status.anime_id),
            episode_number: Set(status.episode_number),
            season: Set(status.season),
            monitored: Set(status.monitored),
            quality_id: Set(status.quality_id),
            is_seadex: Set(status.is_seadex),
            file_path: Set(status.file_path.clone()),
            file_size: Set(status.file_size),
            downloaded_at: Set(status.downloaded_at.clone()),
            resolution_width: Set(status.resolution_width.map(|v| v as i32)),
            resolution_height: Set(status.resolution_height.map(|v| v as i32)),
            video_codec: Set(status.video_codec.clone()),
            audio_codecs: Set(status.audio_codecs.clone()),
            duration_secs: Set(status.duration_secs.map(|v| v as f32)),
        };

        EpisodeStatus::insert(active_model)
            .on_conflict(
                sea_orm::sea_query::OnConflict::columns([
                    episode_status::Column::AnimeId,
                    episode_status::Column::EpisodeNumber,
                ])
                .update_columns([
                    episode_status::Column::Season,
                    episode_status::Column::Monitored,
                    episode_status::Column::QualityId,
                    episode_status::Column::IsSeadex,
                    episode_status::Column::FilePath,
                    episode_status::Column::FileSize,
                    episode_status::Column::DownloadedAt,
                    episode_status::Column::ResolutionWidth,
                    episode_status::Column::ResolutionHeight,
                    episode_status::Column::VideoCodec,
                    episode_status::Column::AudioCodecs,
                    episode_status::Column::DurationSecs,
                ])
                .to_owned(),
            )
            .exec(&self.conn)
            .await?;

        Ok(())
    }

    pub async fn get_calendar_events(
        &self,
        start_date: &str,
        end_date: &str,
    ) -> Result<Vec<CalendarEventRow>> {
        let events = EpisodeMetadata::find()
            .select_only()
            .column(episode_metadata::Column::AnimeId)
            .column(episode_metadata::Column::EpisodeNumber)
            .column(episode_metadata::Column::Title)
            .column(episode_metadata::Column::Aired)
            .column_as(monitored_anime::Column::RomajiTitle, "anime_title")
            .column_as(monitored_anime::Column::CoverImage, "anime_image")
            .column_as(episode_metadata::Column::Title, "episode_title")
            .column_as(
                sea_orm::sea_query::Expr::col((
                    episode_status::Entity,
                    episode_status::Column::FilePath,
                ))
                .is_not_null(),
                "downloaded",
            )
            .join(
                JoinType::InnerJoin,
                episode_metadata::Relation::MonitoredAnime.def(),
            )
            .join(
                JoinType::LeftJoin,
                episode_status::Relation::MonitoredAnime.def().rev(),
            )
            .join(
                JoinType::LeftJoin,
                episode_metadata::Entity::belongs_to(episode_status::Entity)
                    .from(episode_metadata::Column::AnimeId)
                    .to(episode_status::Column::AnimeId)
                    .on_condition(|_left, _right| {
                        sea_orm::Condition::all().add(
                            sea_orm::sea_query::Expr::col((
                                episode_metadata::Entity,
                                episode_metadata::Column::EpisodeNumber,
                            ))
                            .equals((
                                episode_status::Entity,
                                episode_status::Column::EpisodeNumber,
                            )),
                        )
                    })
                    .into(),
            )
            .filter(episode_metadata::Column::Aired.gte(start_date))
            .filter(episode_metadata::Column::Aired.lte(end_date))
            .order_by_asc(episode_metadata::Column::Aired)
            .into_model::<CalendarEventRow>()
            .all(&self.conn)
            .await?;

        Ok(events)
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
        let now = chrono::Utc::now().to_rfc3339();

        let status = EpisodeStatusInput {
            anime_id,
            episode_number,
            season,
            monitored: true,
            quality_id: Some(quality_id),
            is_seadex,
            file_path: Some(file_path.to_string()),
            file_size,
            downloaded_at: Some(now),
            resolution_width: media_info.map(|m| m.resolution_width),
            resolution_height: media_info.map(|m| m.resolution_height),
            video_codec: media_info.map(|m| m.video_codec.clone()),
            audio_codecs: media_info
                .map(|m| serde_json::to_string(&m.audio_codecs).unwrap_or_default()),
            duration_secs: media_info.map(|m| m.duration_secs),
        };

        self.upsert_episode_status(&status).await
    }

    pub async fn clear_episode_download(&self, anime_id: i32, episode_number: i32) -> Result<()> {
        EpisodeStatus::update_many()
            .col_expr(
                episode_status::Column::FilePath,
                sea_orm::sea_query::Expr::value(Option::<String>::None),
            )
            .col_expr(
                episode_status::Column::FileSize,
                sea_orm::sea_query::Expr::value(Option::<i64>::None),
            )
            .col_expr(
                episode_status::Column::DownloadedAt,
                sea_orm::sea_query::Expr::value(Option::<String>::None),
            )
            .col_expr(
                episode_status::Column::QualityId,
                sea_orm::sea_query::Expr::value(Option::<i32>::None),
            )
            .col_expr(
                episode_status::Column::IsSeadex,
                sea_orm::sea_query::Expr::value(false),
            )
            .filter(episode_status::Column::AnimeId.eq(anime_id))
            .filter(episode_status::Column::EpisodeNumber.eq(episode_number))
            .exec(&self.conn)
            .await?;

        Ok(())
    }

    pub async fn update_episode_path(
        &self,
        anime_id: i32,
        episode_number: i32,
        new_path: &str,
    ) -> Result<()> {
        EpisodeStatus::update_many()
            .col_expr(
                episode_status::Column::FilePath,
                sea_orm::sea_query::Expr::value(new_path),
            )
            .filter(episode_status::Column::AnimeId.eq(anime_id))
            .filter(episode_status::Column::EpisodeNumber.eq(episode_number))
            .exec(&self.conn)
            .await?;

        Ok(())
    }

    #[allow(clippy::too_many_arguments)]
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
        let active_model = recycle_bin::ActiveModel {
            original_path: Set(original_path.to_string()),
            recycled_path: Set(recycled_path.map(|s| s.to_string())),
            anime_id: Set(anime_id),
            episode_number: Set(episode_number),
            quality_id: Set(quality_id),
            file_size: Set(file_size),
            reason: Set(reason.to_string()),
            deleted_at: Set(chrono::Utc::now().to_rfc3339()),
            ..Default::default()
        };

        let result = RecycleBin::insert(active_model).exec(&self.conn).await?;
        Ok(result.last_insert_id as i64)
    }

    pub async fn get_old_recycle_entries(&self, older_than: &str) -> Result<Vec<RecycleBinEntry>> {
        let rows = RecycleBin::find()
            .filter(recycle_bin::Column::DeletedAt.lt(older_than))
            .into_model::<RecycleBinEntry>()
            .all(&self.conn)
            .await?;

        Ok(rows)
    }

    pub async fn remove_from_recycle_bin(&self, id: i64) -> Result<()> {
        RecycleBin::delete_by_id(id as i32).exec(&self.conn).await?;
        Ok(())
    }

    pub async fn get_seadex_cache(&self, anime_id: i32) -> Result<Option<SeaDexCache>> {
        let row = SeadexCache::find_by_id(anime_id).one(&self.conn).await?;

        Ok(row.map(|m| SeaDexCache {
            anime_id: m.anime_id,
            groups: m.groups,
            best_release: m.best_release,
            releases: Some(m.releases),
            fetched_at: m.fetched_at,
        }))
    }

    pub async fn cache_seadex(
        &self,
        anime_id: i32,
        groups: &[String],
        best_release: Option<&str>,
        releases: &[SeaDexRelease],
    ) -> Result<()> {
        let groups_json = serde_json::to_string(groups)?;
        let releases_json = serde_json::to_string(releases)?;

        let active_model = seadex_cache::ActiveModel {
            anime_id: Set(anime_id),
            groups: Set(groups_json),
            best_release: Set(best_release.map(|s| s.to_string())),
            releases: Set(releases_json),
            fetched_at: Set(chrono::Utc::now().to_rfc3339()),
        };

        SeadexCache::insert(active_model)
            .on_conflict(
                sea_orm::sea_query::OnConflict::column(seadex_cache::Column::AnimeId)
                    .update_columns([
                        seadex_cache::Column::Groups,
                        seadex_cache::Column::BestRelease,
                        seadex_cache::Column::Releases,
                        seadex_cache::Column::FetchedAt,
                    ])
                    .to_owned(),
            )
            .exec(&self.conn)
            .await?;

        Ok(())
    }

    pub async fn is_seadex_cache_fresh(&self, anime_id: i32) -> Result<bool> {
        let count = SeadexCache::find()
            .filter(seadex_cache::Column::AnimeId.eq(anime_id))
            .filter(
                seadex_cache::Column::FetchedAt.gt(chrono::Utc::now()
                    .checked_sub_signed(chrono::Duration::hours(24))
                    .unwrap()
                    .to_rfc3339()),
            )
            .count(&self.conn)
            .await?;

        Ok(count > 0)
    }

    pub async fn get_quality_profile(&self, id: i32) -> Result<Option<QualityProfileRow>> {
        let row = QualityProfiles::find_by_id(id).one(&self.conn).await?;

        Ok(row.map(|m| QualityProfileRow {
            id: m.id,
            name: m.name,
            cutoff_quality_id: m.cutoff_quality_id,
            upgrade_allowed: m.upgrade_allowed,
            seadex_preferred: m.seadex_preferred,
        }))
    }

    pub async fn get_quality_profile_by_name(
        &self,
        name: &str,
    ) -> Result<Option<QualityProfileRow>> {
        let row = QualityProfiles::find()
            .filter(quality_profiles::Column::Name.eq(name))
            .one(&self.conn)
            .await?;

        Ok(row.map(|m| QualityProfileRow {
            id: m.id,
            name: m.name,
            cutoff_quality_id: m.cutoff_quality_id,
            upgrade_allowed: m.upgrade_allowed,
            seadex_preferred: m.seadex_preferred,
        }))
    }

    pub async fn get_profile_allowed_qualities(&self, profile_id: i32) -> Result<Vec<i32>> {
        let rows = QualityProfileItems::find()
            .filter(quality_profile_items::Column::ProfileId.eq(profile_id))
            .filter(quality_profile_items::Column::Allowed.eq(true))
            .all(&self.conn)
            .await?;

        Ok(rows.into_iter().map(|item| item.quality_id).collect())
    }

    pub async fn add_to_blocklist(&self, info_hash: &str, reason: &str) -> Result<()> {
        let active_model = blocklist::ActiveModel {
            info_hash: Set(info_hash.to_string()),
            reason: Set(reason.to_string()),
            created_at: Set(Some(chrono::Utc::now().to_rfc3339())),
            ..Default::default()
        };

        Blocklist::insert(active_model)
            .on_conflict(
                sea_orm::sea_query::OnConflict::column(blocklist::Column::InfoHash)
                    .do_nothing()
                    .to_owned(),
            )
            .exec(&self.conn)
            .await?;

        Ok(())
    }

    pub async fn is_blocked(&self, info_hash: &str) -> Result<bool> {
        let count = Blocklist::find()
            .filter(blocklist::Column::InfoHash.eq(info_hash))
            .count(&self.conn)
            .await?;

        Ok(count > 0)
    }

    pub async fn sync_profiles(
        &self,
        profiles: &[crate::config::QualityProfileConfig],
    ) -> Result<()> {
        use crate::quality::definition::get_quality_by_name;

        let txn = self.conn.begin().await?;

        for profile in profiles {
            let cutoff_id = match get_quality_by_name(&profile.cutoff) {
                Some(q) => q.id,
                None => {
                    tracing::warn!(
                        "Unknown cutoff quality '{}' for profile '{}', skipping",
                        profile.cutoff,
                        profile.name
                    );
                    continue;
                }
            };

            let active_model = quality_profiles::ActiveModel {
                name: Set(profile.name.clone()),
                cutoff_quality_id: Set(cutoff_id),
                upgrade_allowed: Set(profile.upgrade_allowed),
                seadex_preferred: Set(profile.seadex_preferred),
                ..Default::default()
            };

            let profile_res = QualityProfiles::insert(active_model)
                .on_conflict(
                    sea_orm::sea_query::OnConflict::column(quality_profiles::Column::Name)
                        .update_columns([
                            quality_profiles::Column::CutoffQualityId,
                            quality_profiles::Column::UpgradeAllowed,
                            quality_profiles::Column::SeadexPreferred,
                        ])
                        .to_owned(),
                )
                .exec(&txn)
                .await?;

            let profile_id = if profile_res.last_insert_id > 0 {
                profile_res.last_insert_id as i32
            } else {
                QualityProfiles::find()
                    .filter(quality_profiles::Column::Name.eq(&profile.name))
                    .one(&txn)
                    .await?
                    .ok_or_else(|| anyhow::anyhow!("Failed to fetch profile"))?
                    .id
            };

            QualityProfileItems::delete_many()
                .filter(quality_profile_items::Column::ProfileId.eq(profile_id))
                .exec(&txn)
                .await?;

            for quality_name in &profile.allowed_qualities {
                if let Some(quality) = get_quality_by_name(quality_name) {
                    let item = quality_profile_items::ActiveModel {
                        profile_id: Set(profile_id),
                        quality_id: Set(quality.id),
                        allowed: Set(true),
                    };
                    QualityProfileItems::insert(item).exec(&txn).await?;
                } else {
                    tracing::warn!(
                        "Unknown allowed quality '{}' for profile '{}', skipping",
                        quality_name,
                        profile.name
                    );
                }
            }
        }

        txn.commit().await?;
        Ok(())
    }

    pub async fn get_anime_using_profile(&self, profile_name: &str) -> Result<Vec<AnimeRow>> {
        let profile = QualityProfiles::find()
            .filter(quality_profiles::Column::Name.eq(profile_name))
            .one(&self.conn)
            .await?;

        let profile_id = match profile {
            Some(p) => p.id,
            None => return Ok(vec![]),
        };

        let anime = MonitoredAnime::find()
            .filter(monitored_anime::Column::QualityProfileId.eq(profile_id))
            .all(&self.conn)
            .await?;

        Ok(anime.into_iter().map(AnimeRow::from).collect())
    }

    pub async fn toggle_monitor(&self, id: i32, monitored: bool) -> Result<()> {
        MonitoredAnime::update_many()
            .col_expr(
                monitored_anime::Column::Monitored,
                sea_orm::sea_query::Expr::value(monitored),
            )
            .filter(monitored_anime::Column::Id.eq(id))
            .exec(&self.conn)
            .await?;
        Ok(())
    }

    pub async fn update_anime_path(&self, id: i32, path: &str) -> Result<()> {
        MonitoredAnime::update_many()
            .col_expr(
                monitored_anime::Column::Path,
                sea_orm::sea_query::Expr::value(path),
            )
            .filter(monitored_anime::Column::Id.eq(id))
            .exec(&self.conn)
            .await?;
        info!("Updated path for anime {}: {}", id, path);
        Ok(())
    }
}

#[derive(Debug, Clone)]
pub struct RssFeed {
    pub id: i64,
    pub anime_id: i32,
    pub url: String,
    pub name: Option<String>,
    pub last_checked: Option<String>,
    pub last_item_hash: Option<String>,
    pub enabled: bool,
    pub created_at: String,
}

#[derive(Debug, Clone)]
pub struct EpisodeInput {
    pub episode_number: i32,
    pub title: Option<String>,
    pub title_japanese: Option<String>,
    pub aired: Option<String>,
    pub filler: bool,
    pub recap: bool,
}

#[derive(Debug, Clone, FromQueryResult)]
pub struct EpisodeStatusRow {
    pub anime_id: i32,
    pub episode_number: i32,
    pub season: i32,
    pub monitored: bool,
    pub quality_id: Option<i32>,
    pub is_seadex: bool,
    pub file_path: Option<String>,
    pub file_size: Option<i64>,
    pub downloaded_at: Option<String>,

    pub resolution_width: Option<i32>,
    pub resolution_height: Option<i32>,
    pub video_codec: Option<String>,
    pub audio_codecs: Option<String>,
    pub duration_secs: Option<f32>,
}

#[derive(Debug, Clone)]
pub struct EpisodeStatusInput {
    pub anime_id: i32,
    pub episode_number: i32,
    pub season: i32,
    pub monitored: bool,
    pub quality_id: Option<i32>,
    pub is_seadex: bool,
    pub file_path: Option<String>,
    pub file_size: Option<i64>,
    pub downloaded_at: Option<String>,

    pub resolution_width: Option<i64>,
    pub resolution_height: Option<i64>,
    pub video_codec: Option<String>,
    pub audio_codecs: Option<String>,
    pub duration_secs: Option<f64>,
}

#[derive(Debug, Clone, FromQueryResult)]
pub struct RecycleBinEntry {
    pub id: i64,
    pub original_path: String,
    pub recycled_path: Option<String>,
    pub anime_id: i32,
    pub episode_number: i32,
    pub quality_id: Option<i32>,
    pub file_size: Option<i64>,
    pub deleted_at: String,
    pub reason: String,
}

#[derive(Debug, Clone)]
pub struct SeaDexCache {
    pub anime_id: i32,
    pub groups: String,
    pub best_release: Option<String>,
    pub releases: Option<String>,
    pub fetched_at: String,
}

impl SeaDexCache {
    pub fn get_groups(&self) -> Vec<String> {
        serde_json::from_str(&self.groups).unwrap_or_default()
    }

    pub fn get_releases(&self) -> Vec<SeaDexRelease> {
        if let Some(json) = &self.releases {
            serde_json::from_str(json).unwrap_or_default()
        } else {
            Vec::new()
        }
    }
}

#[derive(Debug, Clone)]
pub struct QualityProfileRow {
    pub id: i32,
    pub name: String,
    pub cutoff_quality_id: i32,
    pub upgrade_allowed: bool,
    pub seadex_preferred: bool,
}
