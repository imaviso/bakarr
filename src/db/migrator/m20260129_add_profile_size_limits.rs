use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        if !manager.has_column("quality_profiles", "min_size").await? {
            manager
                .alter_table(
                    Table::alter()
                        .table(QualityProfiles::Table)
                        .add_column(
                            ColumnDef::new(QualityProfiles::MinSize)
                                .big_integer()
                                .null(),
                        )
                        .to_owned(),
                )
                .await?;
        }

        if !manager.has_column("quality_profiles", "max_size").await? {
            manager
                .alter_table(
                    Table::alter()
                        .table(QualityProfiles::Table)
                        .add_column(
                            ColumnDef::new(QualityProfiles::MaxSize)
                                .big_integer()
                                .null(),
                        )
                        .to_owned(),
                )
                .await?;
        }

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .alter_table(
                Table::alter()
                    .table(QualityProfiles::Table)
                    .drop_column(QualityProfiles::MinSize)
                    .to_owned(),
            )
            .await?;

        manager
            .alter_table(
                Table::alter()
                    .table(QualityProfiles::Table)
                    .drop_column(QualityProfiles::MaxSize)
                    .to_owned(),
            )
            .await
    }
}

#[derive(DeriveIden)]
enum QualityProfiles {
    Table,
    MinSize,
    MaxSize,
}
