use crate::entities::{monitored_anime, prelude::*, quality_profiles, release_history};
use crate::models::anime::{Anime, AnimeTitle};
use sea_orm::{
    ColumnTrait, DatabaseConnection, EntityTrait, JoinType, QueryFilter, QueryOrder, QuerySelect,
    RelationTrait, Set, TransactionTrait,
};
use tracing::info;

pub struct AnimeRepository {
    conn: DatabaseConnection,
}

impl AnimeRepository {
    #[must_use]
    pub const fn new(conn: DatabaseConnection) -> Self {
        Self { conn }
    }

    fn map_model_to_anime(
        model: monitored_anime::Model,
        profile: Option<quality_profiles::Model>,
    ) -> Anime {
        Anime {
            id: model.id,
            title: AnimeTitle {
                romaji: model.romaji_title,
                english: model.english_title,
                native: model.native_title,
            },
            format: model.format,
            episode_count: model.episode_count,
            status: model.status,
            quality_profile_id: model.quality_profile_id,
            cover_image: model.cover_image,
            banner_image: model.banner_image,
            added_at: model.created_at.unwrap_or_default(),
            profile_name: profile.map(|p| p.name),
            path: model.path,
            mal_id: model.mal_id,
            description: model.description,
            score: model.score,
            genres: model.genres.and_then(|s| serde_json::from_str(&s).ok()),
            studios: model.studios.and_then(|s| serde_json::from_str(&s).ok()),
            start_year: model.start_year,
            monitored: model.monitored,
            metadata_provenance: model.metadata_provenance,
        }
    }

    fn base_query() -> sea_orm::SelectTwo<monitored_anime::Entity, quality_profiles::Entity> {
        MonitoredAnime::find().find_also_related(quality_profiles::Entity)
    }

    pub async fn add(&self, anime: &Anime) -> anyhow::Result<()> {
        let active_model = monitored_anime::ActiveModel {
            id: Set(anime.id),
            romaji_title: Set(anime.title.romaji.clone()),
            english_title: Set(anime.title.english.clone()),
            native_title: Set(anime.title.native.clone()),
            format: Set(anime.format.clone()),
            episode_count: Set(anime.episode_count),
            status: Set(anime.status.clone()),
            quality_profile_id: Set(anime.quality_profile_id),
            cover_image: Set(anime.cover_image.clone()),
            banner_image: Set(anime.banner_image.clone()),
            created_at: Set(Some(anime.added_at.clone())),
            path: Set(anime.path.clone()),
            mal_id: Set(anime.mal_id),
            description: Set(anime.description.clone()),
            score: Set(anime.score),
            genres: Set(anime
                .genres
                .as_ref()
                .map(serde_json::to_string)
                .transpose()
                .map_err(|e| anyhow::anyhow!("Failed to serialize genres: {e}"))?),
            studios: Set(anime
                .studios
                .as_ref()
                .map(serde_json::to_string)
                .transpose()
                .map_err(|e| anyhow::anyhow!("Failed to serialize studios: {e}"))?),
            start_year: Set(anime.start_year),
            monitored: Set(anime.monitored),
            current_episode: Set(None),
            metadata_provenance: Set(anime.metadata_provenance.clone()),
        };

        MonitoredAnime::insert(active_model)
            .on_conflict(
                sea_orm::sea_query::OnConflict::column(monitored_anime::Column::Id)
                    .update_columns([
                        monitored_anime::Column::RomajiTitle,
                        monitored_anime::Column::EnglishTitle,
                        monitored_anime::Column::NativeTitle,
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
                        monitored_anime::Column::MetadataProvenance,
                    ])
                    .to_owned(),
            )
            .exec(&self.conn)
            .await?;

        info!("Added (or updated) anime: {}", anime.title.romaji);
        Ok(())
    }

    pub async fn get(&self, id: i32) -> anyhow::Result<Option<Anime>> {
        let result = Self::base_query()
            .filter(monitored_anime::Column::Id.eq(id))
            .one(&self.conn)
            .await?;

        Ok(result.map(|(anime, profile)| Self::map_model_to_anime(anime, profile)))
    }

    pub async fn get_by_ids(&self, ids: &[i32]) -> anyhow::Result<Vec<Anime>> {
        if ids.is_empty() {
            return Ok(Vec::new());
        }

        let rows = Self::base_query()
            .filter(monitored_anime::Column::Id.is_in(ids.iter().copied()))
            .all(&self.conn)
            .await?;

        Ok(rows
            .into_iter()
            .map(|(anime, profile)| Self::map_model_to_anime(anime, profile))
            .collect())
    }

    pub async fn list_monitored(&self) -> anyhow::Result<Vec<Anime>> {
        let rows = Self::base_query()
            .filter(monitored_anime::Column::Monitored.eq(true))
            .order_by_asc(monitored_anime::Column::RomajiTitle)
            .all(&self.conn)
            .await?;

        Ok(rows
            .into_iter()
            .map(|(anime, profile)| Self::map_model_to_anime(anime, profile))
            .collect())
    }

    pub async fn list_monitored_stats(&self) -> anyhow::Result<Vec<(i32, Option<i32>)>> {
        let rows: Vec<(i32, Option<i32>)> = MonitoredAnime::find()
            .select_only()
            .column(monitored_anime::Column::Id)
            .column(monitored_anime::Column::EpisodeCount)
            .filter(monitored_anime::Column::Monitored.eq(true))
            .into_tuple()
            .all(&self.conn)
            .await?;

        Ok(rows)
    }

    pub async fn list_all(&self) -> anyhow::Result<Vec<Anime>> {
        let rows = Self::base_query()
            .order_by_asc(monitored_anime::Column::RomajiTitle)
            .all(&self.conn)
            .await?;

        Ok(rows
            .into_iter()
            .map(|(anime, profile)| Self::map_model_to_anime(anime, profile))
            .collect())
    }

    pub async fn remove(&self, id: i32) -> anyhow::Result<bool> {
        let txn = self.conn.begin().await?;

        release_history::Entity::delete_many()
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

    pub async fn update_path(&self, id: i32, path: &str) -> anyhow::Result<()> {
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

    pub async fn toggle_monitor(&self, id: i32, monitored: bool) -> anyhow::Result<()> {
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

    pub async fn update_quality_profile(&self, id: i32, profile_id: i32) -> anyhow::Result<()> {
        MonitoredAnime::update_many()
            .col_expr(
                monitored_anime::Column::QualityProfileId,
                sea_orm::sea_query::Expr::value(profile_id),
            )
            .filter(monitored_anime::Column::Id.eq(id))
            .exec(&self.conn)
            .await?;
        Ok(())
    }

    pub async fn get_using_profile(&self, profile_name: &str) -> anyhow::Result<Vec<Anime>> {
        let rows = MonitoredAnime::find()
            .join(
                JoinType::InnerJoin,
                monitored_anime::Relation::QualityProfiles.def(),
            )
            .filter(quality_profiles::Column::Name.eq(profile_name))
            .find_also_related(quality_profiles::Entity)
            .all(&self.conn)
            .await?;

        Ok(rows
            .into_iter()
            .map(|(anime, profile)| Self::map_model_to_anime(anime, profile))
            .collect())
    }
}
