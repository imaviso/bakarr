use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .create_table(
                Table::create()
                    .table(SearchCache::Table)
                    .if_not_exists()
                    .col(
                        ColumnDef::new(SearchCache::Id)
                            .integer()
                            .not_null()
                            .auto_increment()
                            .primary_key(),
                    )
                    .col(ColumnDef::new(SearchCache::Query).string().not_null())
                    .col(ColumnDef::new(SearchCache::ResultsJson).text().not_null())
                    .col(
                        ColumnDef::new(SearchCache::CreatedAt)
                            .timestamp()
                            .not_null()
                            .default(Expr::current_timestamp()),
                    )
                    .col(
                        ColumnDef::new(SearchCache::ExpiresAt)
                            .timestamp()
                            .not_null(),
                    )
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("idx_search_cache_query")
                    .table(SearchCache::Table)
                    .col(SearchCache::Query)
                    .to_owned(),
            )
            .await?;

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .drop_table(Table::drop().table(SearchCache::Table).to_owned())
            .await
    }
}

#[derive(DeriveIden)]
enum SearchCache {
    Table,
    Id,
    Query,
    ResultsJson,
    CreatedAt,
    ExpiresAt,
}
