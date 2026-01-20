use crate::clients::seadex::SeaDexRelease;
use crate::entities::{prelude::*, seadex_cache};
use anyhow::Result;
use sea_orm::{ColumnTrait, DatabaseConnection, EntityTrait, PaginatorTrait, QueryFilter, Set};

/// Repository for SeaDex cache operations
pub struct CacheRepository {
    conn: DatabaseConnection,
}

impl CacheRepository {
    pub fn new(conn: DatabaseConnection) -> Self {
        Self { conn }
    }

    // ========================================================================
    // SeaDex Cache Operations
    // ========================================================================

    pub async fn get_seadex(&self, anime_id: i32) -> Result<Option<SeaDexCache>> {
        let row = SeadexCache::find_by_id(anime_id).one(&self.conn).await?;

        Ok(row.map(|m| SeaDexCache {
            anime_id: m.anime_id,
            groups: m.groups,
            best_release: m.best_release,
            releases: Some(m.releases),
            fetched_at: m.fetched_at,
        }))
    }

    pub async fn set_seadex(
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

    pub async fn is_seadex_fresh(&self, anime_id: i32) -> Result<bool> {
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
}

// ============================================================================
// Data Types
// ============================================================================

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
