use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        // Add metadata_provenance column to monitored_anime
        if !manager
            .has_column("monitored_anime", "metadata_provenance")
            .await?
        {
            manager
                .alter_table(
                    Table::alter()
                        .table(MonitoredAnime::Table)
                        .add_column(
                            ColumnDef::new(MonitoredAnime::MetadataProvenance)
                                .string()
                                .null(),
                        )
                        .to_owned(),
                )
                .await?;
        }

        // Add metadata_provenance column to episode_metadata
        if !manager
            .has_column("episode_metadata", "metadata_provenance")
            .await?
        {
            manager
                .alter_table(
                    Table::alter()
                        .table(EpisodeMetadata::Table)
                        .add_column(
                            ColumnDef::new(EpisodeMetadata::MetadataProvenance)
                                .string()
                                .null(),
                        )
                        .to_owned(),
                )
                .await?;
        }

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        if manager
            .has_column("monitored_anime", "metadata_provenance")
            .await?
        {
            manager
                .alter_table(
                    Table::alter()
                        .table(MonitoredAnime::Table)
                        .drop_column(MonitoredAnime::MetadataProvenance)
                        .to_owned(),
                )
                .await?;
        }

        if manager
            .has_column("episode_metadata", "metadata_provenance")
            .await?
        {
            manager
                .alter_table(
                    Table::alter()
                        .table(EpisodeMetadata::Table)
                        .drop_column(EpisodeMetadata::MetadataProvenance)
                        .to_owned(),
                )
                .await?;
        }

        Ok(())
    }
}

#[derive(DeriveIden)]
enum MonitoredAnime {
    #[sea_orm(iden = "monitored_anime")]
    Table,
    MetadataProvenance,
}

#[derive(DeriveIden)]
enum EpisodeMetadata {
    #[sea_orm(iden = "episode_metadata")]
    Table,
    MetadataProvenance,
}
