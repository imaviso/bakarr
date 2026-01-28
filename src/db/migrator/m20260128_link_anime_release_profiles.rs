use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        // Add is_global column to ReleaseProfiles
        manager
            .alter_table(
                Table::alter()
                    .table(ReleaseProfiles::Table)
                    .add_column(
                        ColumnDef::new(ReleaseProfiles::IsGlobal)
                            .boolean()
                            .not_null()
                            .default(true),
                    )
                    .to_owned(),
            )
            .await?;

        // Create AnimeReleaseProfiles join table
        manager
            .create_table(
                Table::create()
                    .table(AnimeReleaseProfiles::Table)
                    .if_not_exists()
                    .col(
                        ColumnDef::new(AnimeReleaseProfiles::AnimeId)
                            .integer()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(AnimeReleaseProfiles::ProfileId)
                            .integer()
                            .not_null(),
                    )
                    .primary_key(
                        Index::create()
                            .name("pk_anime_release_profiles")
                            .col(AnimeReleaseProfiles::AnimeId)
                            .col(AnimeReleaseProfiles::ProfileId),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk_anime_release_profiles_anime_id")
                            .from(AnimeReleaseProfiles::Table, AnimeReleaseProfiles::AnimeId)
                            .to(MonitoredAnime::Table, MonitoredAnime::Id)
                            .on_delete(ForeignKeyAction::Cascade)
                            .on_update(ForeignKeyAction::Cascade),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk_anime_release_profiles_profile_id")
                            .from(AnimeReleaseProfiles::Table, AnimeReleaseProfiles::ProfileId)
                            .to(ReleaseProfiles::Table, ReleaseProfiles::Id)
                            .on_delete(ForeignKeyAction::Cascade)
                            .on_update(ForeignKeyAction::Cascade),
                    )
                    .to_owned(),
            )
            .await
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .drop_table(Table::drop().table(AnimeReleaseProfiles::Table).to_owned())
            .await?;

        manager
            .alter_table(
                Table::alter()
                    .table(ReleaseProfiles::Table)
                    .drop_column(ReleaseProfiles::IsGlobal)
                    .to_owned(),
            )
            .await
    }
}

#[derive(DeriveIden)]
enum ReleaseProfiles {
    Table,
    Id,
    IsGlobal,
}

#[derive(DeriveIden)]
enum MonitoredAnime {
    Table,
    Id,
}

#[derive(DeriveIden)]
enum AnimeReleaseProfiles {
    Table,
    AnimeId,
    ProfileId,
}
