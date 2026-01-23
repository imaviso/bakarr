use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .create_table(
                Table::create()
                    .table(SystemLogs::Table)
                    .if_not_exists()
                    .col(
                        ColumnDef::new(SystemLogs::Id)
                            .integer()
                            .not_null()
                            .auto_increment()
                            .primary_key(),
                    )
                    .col(ColumnDef::new(SystemLogs::EventType).string().not_null())
                    .col(ColumnDef::new(SystemLogs::Level).string().not_null())
                    .col(ColumnDef::new(SystemLogs::Message).string().not_null())
                    .col(ColumnDef::new(SystemLogs::Details).string().null())
                    .col(
                        ColumnDef::new(SystemLogs::CreatedAt)
                            .date_time()
                            .not_null()
                            .extra("DEFAULT CURRENT_TIMESTAMP".to_owned()),
                    )
                    .to_owned(),
            )
            .await?;

        // Index on created_at for sorting/filtering
        manager
            .create_index(
                Index::create()
                    .name("idx_system_logs_created_at")
                    .table(SystemLogs::Table)
                    .col(SystemLogs::CreatedAt)
                    .to_owned(),
            )
            .await
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .drop_table(Table::drop().table(SystemLogs::Table).to_owned())
            .await
    }
}

#[derive(Iden)]
enum SystemLogs {
    Table,
    Id,
    EventType,
    Level,
    Message,
    Details,
    CreatedAt,
}
