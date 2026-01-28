use crate::clients::seadex::SeaDexRelease;
use crate::entities::{prelude::*, seadex_cache, search_cache};
use crate::services::search::SearchResult;
use anyhow::Result;
use sea_orm::{ColumnTrait, DatabaseConnection, EntityTrait, PaginatorTrait, QueryFilter, Set};

pub struct CacheRepository {
    conn: DatabaseConnection,
}

impl CacheRepository {
    #[must_use]
    pub const fn new(conn: DatabaseConnection) -> Self {
        Self { conn }
    }

    pub async fn get_cached_search(&self, query: &str) -> Result<Option<Vec<SearchResult>>> {
        let now = chrono::Utc::now().to_rfc3339();

        // Cleanup expired entries first (opportunistic cleanup)
        // Ideally this would be a background job, but this is simple.
        let _ = SearchCache::delete_many()
            .filter(search_cache::Column::ExpiresAt.lt(&now))
            .exec(&self.conn)
            .await;

        let entry = SearchCache::find()
            .filter(search_cache::Column::Query.eq(query))
            .filter(search_cache::Column::ExpiresAt.gt(&now))
            .one(&self.conn)
            .await?;

        if let Some(e) = entry {
            let results: Vec<SearchResult> = serde_json::from_str(&e.results_json)?;
            Ok(Some(results))
        } else {
            Ok(None)
        }
    }

    pub async fn cache_search_results(&self, query: &str, results: &[SearchResult]) -> Result<()> {
        let results_json = serde_json::to_string(results)?;
        let now = chrono::Utc::now();
        // Cache for 15 minutes
        let expires_at = (now + chrono::Duration::minutes(15)).to_rfc3339();
        let created_at = now.to_rfc3339();

        // Note: SQLite/SeaORM doesn't support "ON CONFLICT UPDATE" cleanly without unique constraints on non-primary keys easily in some versions,
        // but we assume `query` is not unique yet in the entity definition?
        // Wait, I didn't add a unique constraint to `query` in the migration, just an index.
        // Let's add a check first or just insert.
        // Actually, if we want to update the cache for the same query, we should probably check if it exists.
        // Or better, let's delete the old one first.

        let _ = SearchCache::delete_many()
            .filter(search_cache::Column::Query.eq(query))
            .exec(&self.conn)
            .await;

        let active_model = search_cache::ActiveModel {
            query: Set(query.to_string()),
            results_json: Set(results_json),
            created_at: Set(created_at),
            expires_at: Set(expires_at),
            ..Default::default()
        };

        // We need to construct ActiveModel correctly. ID is NotSet by default.
        // Let's fix the ActiveModel construction below.

        search_cache::Entity::insert(active_model)
            .exec(&self.conn)
            .await?;

        Ok(())
    }

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
            best_release: Set(best_release.map(std::string::ToString::to_string)),
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
        let threshold = chrono::Utc::now()
            .checked_sub_signed(chrono::Duration::hours(24))
            .map_or_else(|| "1970-01-01T00:00:00Z".to_string(), |t| t.to_rfc3339());

        let count = SeadexCache::find()
            .filter(seadex_cache::Column::AnimeId.eq(anime_id))
            .filter(seadex_cache::Column::FetchedAt.gt(threshold))
            .count(&self.conn)
            .await?;

        Ok(count > 0)
    }
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
    #[must_use]
    pub fn get_groups(&self) -> Vec<String> {
        serde_json::from_str(&self.groups).unwrap_or_default()
    }

    #[must_use]
    pub fn get_releases(&self) -> Vec<SeaDexRelease> {
        self.releases.as_ref().map_or_else(Vec::new, |json| {
            serde_json::from_str(json).unwrap_or_default()
        })
    }
}
