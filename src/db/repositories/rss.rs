use crate::entities::{prelude::*, rss_feeds};
use anyhow::Result;
use sea_orm::{
    ColumnTrait, DatabaseConnection, EntityTrait, PaginatorTrait, QueryFilter, QueryOrder, Set,
};
use tracing::info;

/// Repository for RSS feed operations
pub struct RssRepository {
    conn: DatabaseConnection,
}

impl RssRepository {
    pub fn new(conn: DatabaseConnection) -> Self {
        Self { conn }
    }

    // ========================================================================
    // Model Conversion Helpers
    // ========================================================================

    fn map_feed_model(r: rss_feeds::Model) -> RssFeed {
        RssFeed {
            id: r.id as i64,
            anime_id: r.anime_id,
            url: r.url,
            name: r.name,
            last_checked: r.last_checked,
            last_item_hash: r.last_item_hash,
            enabled: r.enabled,
            created_at: r.created_at.unwrap_or_default(),
        }
    }

    // ========================================================================
    // RSS Feed Operations
    // ========================================================================

    pub async fn add(&self, anime_id: i32, url: &str, name: Option<&str>) -> Result<i64> {
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

    pub async fn get(&self, id: i64) -> Result<Option<RssFeed>> {
        let result = RssFeeds::find_by_id(id as i32).one(&self.conn).await?;
        Ok(result.map(Self::map_feed_model))
    }

    pub async fn get_for_anime(&self, anime_id: i32) -> Result<Vec<RssFeed>> {
        let rows = RssFeeds::find()
            .filter(rss_feeds::Column::AnimeId.eq(anime_id))
            .order_by_asc(rss_feeds::Column::CreatedAt)
            .all(&self.conn)
            .await?;

        Ok(rows.into_iter().map(Self::map_feed_model).collect())
    }

    pub async fn get_enabled(&self) -> Result<Vec<RssFeed>> {
        let rows = RssFeeds::find()
            .filter(rss_feeds::Column::Enabled.eq(true))
            .order_by_asc(rss_feeds::Column::LastChecked)
            .all(&self.conn)
            .await?;

        Ok(rows.into_iter().map(Self::map_feed_model).collect())
    }

    pub async fn list_all(&self) -> Result<Vec<RssFeed>> {
        let rows = RssFeeds::find()
            .order_by_asc(rss_feeds::Column::CreatedAt)
            .all(&self.conn)
            .await?;

        Ok(rows.into_iter().map(Self::map_feed_model).collect())
    }

    pub async fn update_checked(&self, feed_id: i64, last_item_hash: Option<&str>) -> Result<()> {
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

    pub async fn toggle(&self, feed_id: i64, enabled: bool) -> Result<bool> {
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

    pub async fn remove(&self, feed_id: i64) -> Result<bool> {
        let result = RssFeeds::delete_by_id(feed_id as i32)
            .exec(&self.conn)
            .await?;
        Ok(result.rows_affected > 0)
    }

    pub async fn count_for_anime(&self, anime_id: i32) -> Result<i32> {
        let count = RssFeeds::find()
            .filter(rss_feeds::Column::AnimeId.eq(anime_id))
            .count(&self.conn)
            .await?;

        Ok(count as i32)
    }
}

// ============================================================================
// Data Types
// ============================================================================

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
