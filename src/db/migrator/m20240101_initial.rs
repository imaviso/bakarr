use crate::entities::prelude::*;
use sea_orm_migration::prelude::*;
use sea_orm_migration::sea_orm::Schema;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let backend = manager.get_database_backend();
        let schema = Schema::new(backend);

        manager
            .create_table(
                schema
                    .create_table_from_entity(QualityDefinitions)
                    .if_not_exists()
                    .to_owned(),
            )
            .await?;

        manager
            .create_table(
                schema
                    .create_table_from_entity(QualityProfiles)
                    .if_not_exists()
                    .to_owned(),
            )
            .await?;

        manager
            .create_table(
                schema
                    .create_table_from_entity(QualityProfileItems)
                    .if_not_exists()
                    .to_owned(),
            )
            .await?;

        manager
            .create_table(
                schema
                    .create_table_from_entity(Blocklist)
                    .if_not_exists()
                    .to_owned(),
            )
            .await?;

        manager
            .create_table(
                schema
                    .create_table_from_entity(MonitoredAnime)
                    .if_not_exists()
                    .to_owned(),
            )
            .await?;

        manager
            .create_table(
                schema
                    .create_table_from_entity(EpisodeStatus)
                    .if_not_exists()
                    .to_owned(),
            )
            .await?;

        manager
            .create_table(
                schema
                    .create_table_from_entity(EpisodeMetadata)
                    .if_not_exists()
                    .to_owned(),
            )
            .await?;

        manager
            .create_table(
                schema
                    .create_table_from_entity(ReleaseHistory)
                    .if_not_exists()
                    .to_owned(),
            )
            .await?;

        manager
            .create_table(
                schema
                    .create_table_from_entity(RssFeeds)
                    .if_not_exists()
                    .to_owned(),
            )
            .await?;

        manager
            .create_table(
                schema
                    .create_table_from_entity(RecycleBin)
                    .if_not_exists()
                    .to_owned(),
            )
            .await?;

        manager
            .create_table(
                schema
                    .create_table_from_entity(SeadexCache)
                    .if_not_exists()
                    .to_owned(),
            )
            .await?;

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .drop_table(Table::drop().table(SeadexCache).to_owned())
            .await?;
        manager
            .drop_table(Table::drop().table(RecycleBin).to_owned())
            .await?;
        manager
            .drop_table(Table::drop().table(RssFeeds).to_owned())
            .await?;
        manager
            .drop_table(Table::drop().table(ReleaseHistory).to_owned())
            .await?;
        manager
            .drop_table(Table::drop().table(EpisodeMetadata).to_owned())
            .await?;
        manager
            .drop_table(Table::drop().table(EpisodeStatus).to_owned())
            .await?;
        manager
            .drop_table(Table::drop().table(MonitoredAnime).to_owned())
            .await?;
        manager
            .drop_table(Table::drop().table(QualityProfileItems).to_owned())
            .await?;
        manager
            .drop_table(Table::drop().table(QualityProfiles).to_owned())
            .await?;
        manager
            .drop_table(Table::drop().table(QualityDefinitions).to_owned())
            .await?;

        Ok(())
    }
}
