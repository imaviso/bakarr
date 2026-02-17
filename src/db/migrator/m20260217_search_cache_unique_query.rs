use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let conn = manager.get_connection();

        conn.execute_unprepared(
            "DELETE FROM search_cache WHERE rowid NOT IN (SELECT MIN(rowid) FROM search_cache GROUP BY query)",
        )
        .await?;

        conn.execute_unprepared("DROP INDEX IF EXISTS idx_search_cache_query")
            .await?;

        conn.execute_unprepared(
            "CREATE UNIQUE INDEX IF NOT EXISTS idx_search_cache_query_unique ON search_cache(query)",
        )
        .await?;

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let conn = manager.get_connection();

        conn.execute_unprepared("DROP INDEX IF EXISTS idx_search_cache_query_unique")
            .await?;

        conn.execute_unprepared(
            "CREATE INDEX IF NOT EXISTS idx_search_cache_query ON search_cache(query)",
        )
        .await?;

        Ok(())
    }
}
