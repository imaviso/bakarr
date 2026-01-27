use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .create_table(
                Table::create()
                    .table(AnimeMetadata::Table)
                    .if_not_exists()
                    .col(
                        ColumnDef::new(AnimeMetadata::Id)
                            .integer()
                            .not_null()
                            .auto_increment()
                            .primary_key(),
                    )
                    .col(ColumnDef::new(AnimeMetadata::AnilistId).integer())
                    .col(ColumnDef::new(AnimeMetadata::MalId).integer())
                    .col(ColumnDef::new(AnimeMetadata::AnidbId).integer())
                    .col(ColumnDef::new(AnimeMetadata::KitsuId).integer())
                    .col(ColumnDef::new(AnimeMetadata::Title).string().not_null())
                    .col(ColumnDef::new(AnimeMetadata::Synonyms).string())
                    .col(ColumnDef::new(AnimeMetadata::Type).string())
                    .col(ColumnDef::new(AnimeMetadata::Status).string())
                    .col(ColumnDef::new(AnimeMetadata::Season).string())
                    .col(ColumnDef::new(AnimeMetadata::Year).integer())
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("idx_anime_metadata_anilist_id")
                    .table(AnimeMetadata::Table)
                    .col(AnimeMetadata::AnilistId)
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("idx_anime_metadata_mal_id")
                    .table(AnimeMetadata::Table)
                    .col(AnimeMetadata::MalId)
                    .to_owned(),
            )
            .await
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .drop_table(Table::drop().table(AnimeMetadata::Table).to_owned())
            .await
    }
}

#[derive(DeriveIden)]
enum AnimeMetadata {
    Table,
    Id,
    AnilistId,
    MalId,
    AnidbId,
    KitsuId,
    Title,
    Synonyms,
    Type,
    Status,
    Season,
    Year,
}
