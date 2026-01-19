use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .get_connection()
            .execute_unprepared("ALTER TABLE episode_metadata RENAME TO episode_metadata_old")
            .await?;

        manager.get_connection().execute_unprepared(r#"
            CREATE TABLE episode_metadata (
                anime_id INTEGER NOT NULL,
                episode_number INTEGER NOT NULL,
                title TEXT,
                title_japanese TEXT,
                aired TEXT,
                filler BOOLEAN NOT NULL,
                recap BOOLEAN NOT NULL,
                fetched_at TEXT NOT NULL,
                PRIMARY KEY (anime_id, episode_number),
                FOREIGN KEY (anime_id) REFERENCES monitored_anime (id) ON DELETE CASCADE ON UPDATE NO ACTION
            )
        "#).await?;

        manager
            .get_connection()
            .execute_unprepared(
                r#"
            INSERT INTO episode_metadata (
                anime_id, episode_number, title, title_japanese, aired, filler, recap, fetched_at
            )
            SELECT 
                anime_id, episode_number, title, title_japanese, aired, filler, recap, fetched_at
            FROM episode_metadata_old
        "#,
            )
            .await?;

        manager
            .get_connection()
            .execute_unprepared("DROP TABLE episode_metadata_old")
            .await?;

        Ok(())
    }

    async fn down(&self, _manager: &SchemaManager) -> Result<(), DbErr> {
        Ok(())
    }
}
