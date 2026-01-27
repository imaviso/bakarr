use crate::entities::anime_metadata;
use anyhow::Result;
use sea_orm::{ColumnTrait, DatabaseConnection, EntityTrait, PaginatorTrait, QueryFilter};

pub struct AnimeMetadataRepository {
    conn: DatabaseConnection,
}

impl AnimeMetadataRepository {
    #[must_use]
    pub const fn new(conn: DatabaseConnection) -> Self {
        Self { conn }
    }

    pub async fn is_empty(&self) -> Result<bool> {
        let count = anime_metadata::Entity::find().count(&self.conn).await?;
        Ok(count == 0)
    }

    pub async fn batch_insert(&self, entries: Vec<anime_metadata::ActiveModel>) -> Result<()> {
        // SQLite has a limit on variables per query (usually 999 or 32766)
        // With ~10 columns, 100 rows per batch = 1000 params, which is safe
        for chunk in entries.chunks(100) {
            anime_metadata::Entity::insert_many(chunk.to_vec())
                .exec(&self.conn)
                .await?;
        }
        Ok(())
    }

    pub async fn get_by_anilist_id(
        &self,
        anilist_id: i32,
    ) -> Result<Option<anime_metadata::Model>> {
        let model = anime_metadata::Entity::find()
            .filter(anime_metadata::Column::AnilistId.eq(anilist_id))
            .one(&self.conn)
            .await?;
        Ok(model)
    }

    pub async fn get_by_mal_id(&self, mal_id: i32) -> Result<Option<anime_metadata::Model>> {
        let model = anime_metadata::Entity::find()
            .filter(anime_metadata::Column::MalId.eq(mal_id))
            .one(&self.conn)
            .await?;
        Ok(model)
    }

    pub async fn clear(&self) -> Result<()> {
        anime_metadata::Entity::delete_many()
            .exec(&self.conn)
            .await?;
        Ok(())
    }
}
