use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let result = manager
            .alter_table(
                Table::alter()
                    .table(QualityProfileItems::Table)
                    .add_column(
                        ColumnDef::new(QualityProfileItems::SortIndex)
                            .integer()
                            .not_null()
                            .default(0),
                    )
                    .to_owned(),
            )
            .await;

        match result {
            Ok(()) => Ok(()),
            Err(e) => {
                let msg = e.to_string();
                if msg.contains("duplicate column") {
                    return Ok(());
                }
                Err(e)
            }
        }
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .alter_table(
                Table::alter()
                    .table(QualityProfileItems::Table)
                    .drop_column(QualityProfileItems::SortIndex)
                    .to_owned(),
            )
            .await
    }
}

#[derive(DeriveIden)]
enum QualityProfileItems {
    Table,
    SortIndex,
}
