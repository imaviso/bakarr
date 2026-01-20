use crate::entities::{episode_metadata, episode_status, monitored_anime, prelude::*};
use crate::models::episode::{EpisodeInput, EpisodeStatusInput, EpisodeStatusRow};
use crate::models::media::MediaInfo;
use anyhow::Result;
use sea_orm::{
    ColumnTrait, DatabaseConnection, EntityTrait, FromQueryResult, JoinType, PaginatorTrait,
    QueryFilter, QueryOrder, QuerySelect, RelationTrait, Set,
};
use std::collections::HashMap;

/// Repository for episode metadata and status operations
pub struct EpisodeRepository {
    conn: DatabaseConnection,
}

impl EpisodeRepository {
    pub fn new(conn: DatabaseConnection) -> Self {
        Self { conn }
    }

    // ========================================================================
    // Model Conversion Helpers
    // ========================================================================

    /// Convert episode_status::Model to domain EpisodeStatusRow
    fn map_status_model(m: episode_status::Model) -> EpisodeStatusRow {
        EpisodeStatusRow {
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
        }
    }

    // ========================================================================
    // Episode Metadata Operations
    // ========================================================================

    pub async fn get_title(&self, anime_id: i32, episode_number: i32) -> Result<Option<String>> {
        let result = EpisodeMetadata::find()
            .filter(episode_metadata::Column::AnimeId.eq(anime_id))
            .filter(episode_metadata::Column::EpisodeNumber.eq(episode_number))
            .one(&self.conn)
            .await?;

        Ok(result.and_then(|m| m.title))
    }

    pub async fn get_metadata(
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

    pub async fn get_all_for_anime(&self, anime_id: i32) -> Result<Vec<episode_metadata::Model>> {
        let rows = EpisodeMetadata::find()
            .filter(episode_metadata::Column::AnimeId.eq(anime_id))
            .order_by_asc(episode_metadata::Column::EpisodeNumber)
            .all(&self.conn)
            .await?;

        Ok(rows)
    }

    pub async fn has_cached(&self, anime_id: i32) -> Result<bool> {
        let count = EpisodeMetadata::find()
            .filter(episode_metadata::Column::AnimeId.eq(anime_id))
            .count(&self.conn)
            .await?;

        Ok(count > 0)
    }

    pub async fn cache_one(&self, anime_id: i32, episode: &EpisodeInput) -> Result<()> {
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

    pub async fn cache_many(&self, anime_id: i32, episodes: &[EpisodeInput]) -> Result<()> {
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

    pub async fn clear_cache(&self, anime_id: i32) -> Result<()> {
        EpisodeMetadata::delete_many()
            .filter(episode_metadata::Column::AnimeId.eq(anime_id))
            .exec(&self.conn)
            .await?;
        Ok(())
    }

    // ========================================================================
    // Episode Status Operations
    // ========================================================================

    pub async fn get_status(
        &self,
        anime_id: i32,
        episode_number: i32,
    ) -> Result<Option<EpisodeStatusRow>> {
        let row = EpisodeStatus::find()
            .filter(episode_status::Column::AnimeId.eq(anime_id))
            .filter(episode_status::Column::EpisodeNumber.eq(episode_number))
            .one(&self.conn)
            .await?;

        Ok(row.map(Self::map_status_model))
    }

    pub async fn get_statuses(&self, anime_id: i32) -> Result<Vec<EpisodeStatusRow>> {
        let rows = EpisodeStatus::find()
            .filter(episode_status::Column::AnimeId.eq(anime_id))
            .order_by_asc(episode_status::Column::EpisodeNumber)
            .all(&self.conn)
            .await?;

        Ok(rows.into_iter().map(Self::map_status_model).collect())
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
        // Placeholder - queue count logic
        Ok(0)
    }

    pub async fn get_download_counts_for_anime_ids(
        &self,
        anime_ids: &[i32],
    ) -> Result<HashMap<i32, i32>> {
        if anime_ids.is_empty() {
            return Ok(HashMap::new());
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

        let mut map = HashMap::new();
        for (id, count) in results {
            map.insert(id, count as i32);
        }

        Ok(map)
    }

    pub async fn get_missing(&self, anime_id: i32, total_episodes: i32) -> Result<Vec<i32>> {
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

    pub async fn upsert_status(&self, status: &EpisodeStatusInput) -> Result<()> {
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

    #[allow(clippy::too_many_arguments)]
    pub async fn mark_downloaded(
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

        self.upsert_status(&status).await
    }

    pub async fn clear_download(&self, anime_id: i32, episode_number: i32) -> Result<()> {
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

    pub async fn update_path(
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

    // ========================================================================
    // Calendar Events (uses episode metadata + status)
    // ========================================================================

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
}

/// Calendar event row for query results
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
