use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        // Create release_profiles table
        manager
            .create_table(
                Table::create()
                    .table(ReleaseProfiles::Table)
                    .if_not_exists()
                    .col(
                        ColumnDef::new(ReleaseProfiles::Id)
                            .integer()
                            .not_null()
                            .auto_increment()
                            .primary_key(),
                    )
                    .col(
                        ColumnDef::new(ReleaseProfiles::Name)
                            .string()
                            .not_null()
                            .unique_key(),
                    )
                    .col(
                        ColumnDef::new(ReleaseProfiles::Enabled)
                            .boolean()
                            .not_null()
                            .default(true),
                    )
                    .to_owned(),
            )
            .await?;

        // Create release_profile_rules table
        manager
            .create_table(
                Table::create()
                    .table(ReleaseProfileRules::Table)
                    .if_not_exists()
                    .col(
                        ColumnDef::new(ReleaseProfileRules::Id)
                            .integer()
                            .not_null()
                            .auto_increment()
                            .primary_key(),
                    )
                    .col(
                        ColumnDef::new(ReleaseProfileRules::ProfileId)
                            .integer()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(ReleaseProfileRules::Term)
                            .string()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(ReleaseProfileRules::Score)
                            .integer()
                            .not_null()
                            .default(0),
                    )
                    .col(
                        ColumnDef::new(ReleaseProfileRules::RuleType)
                            .string()
                            .not_null(), // "preferred", "must", "must_not"
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk_release_profile_rules_profile_id")
                            .from(ReleaseProfileRules::Table, ReleaseProfileRules::ProfileId)
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
            .drop_table(Table::drop().table(ReleaseProfileRules::Table).to_owned())
            .await?;
        manager
            .drop_table(Table::drop().table(ReleaseProfiles::Table).to_owned())
            .await
    }
}

#[derive(DeriveIden)]
enum ReleaseProfiles {
    Table,
    Id,
    Name,
    Enabled,
}

#[derive(DeriveIden)]
enum ReleaseProfileRules {
    Table,
    Id,
    ProfileId,
    Term,
    Score,
    RuleType,
}
