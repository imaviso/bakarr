use crate::entities::{prelude::*, system_logs};
use anyhow::Result;
use sea_orm::{
    ColumnTrait, DatabaseConnection, EntityTrait, PaginatorTrait, QueryFilter, QueryOrder, Set,
};

pub struct LogRepository {
    conn: DatabaseConnection,
}

impl LogRepository {
    #[must_use]
    pub const fn new(conn: DatabaseConnection) -> Self {
        Self { conn }
    }

    pub async fn add(
        &self,
        event_type: &str,
        level: &str,
        message: &str,
        details: Option<String>,
    ) -> Result<()> {
        let now = chrono::Utc::now().to_rfc3339();

        let active_model = system_logs::ActiveModel {
            event_type: Set(event_type.to_string()),
            level: Set(level.to_string()),
            message: Set(message.to_string()),
            details: Set(details),
            created_at: Set(now),
            ..Default::default()
        };

        SystemLogs::insert(active_model).exec(&self.conn).await?;
        Ok(())
    }

    pub async fn get_logs(
        &self,
        page: u64,
        page_size: u64,
        level_filter: Option<String>,
        event_type_filter: Option<String>,
        start_date: Option<String>,
        end_date: Option<String>,
    ) -> Result<(Vec<system_logs::Model>, u64)> {
        let mut query = SystemLogs::find().order_by_desc(system_logs::Column::CreatedAt);

        if let Some(level) = level_filter {
            query = query.filter(system_logs::Column::Level.eq(level));
        }

        if let Some(event_type) = event_type_filter {
            query = query.filter(system_logs::Column::EventType.contains(event_type));
        }

        if let Some(start) = start_date {
            query = query.filter(system_logs::Column::CreatedAt.gte(start));
        }

        if let Some(end) = end_date {
            query = query.filter(system_logs::Column::CreatedAt.lte(end));
        }

        let paginator = query.paginate(&self.conn, page_size);
        let total_pages = paginator.num_pages().await?;
        let items = paginator.fetch_page(page - 1).await?;

        Ok((items, total_pages))
    }

    pub async fn get_all_logs(
        &self,
        level_filter: Option<String>,
        event_type_filter: Option<String>,
        start_date: Option<String>,
        end_date: Option<String>,
    ) -> Result<Vec<system_logs::Model>> {
        let mut query = SystemLogs::find().order_by_desc(system_logs::Column::CreatedAt);

        if let Some(level) = level_filter {
            query = query.filter(system_logs::Column::Level.eq(level));
        }

        if let Some(event_type) = event_type_filter {
            query = query.filter(system_logs::Column::EventType.contains(event_type));
        }

        if let Some(start) = start_date {
            query = query.filter(system_logs::Column::CreatedAt.gte(start));
        }

        if let Some(end) = end_date {
            query = query.filter(system_logs::Column::CreatedAt.lte(end));
        }

        let items = query.all(&self.conn).await?;
        Ok(items)
    }

    pub async fn clear_logs(&self) -> Result<()> {
        SystemLogs::delete_many().exec(&self.conn).await?;
        Ok(())
    }

    pub async fn prune_logs(&self, older_than_days: i64) -> Result<u64> {
        let result = SystemLogs::delete_many()
            .filter(
                sea_orm::Condition::all().add(
                    sea_orm::sea_query::Expr::col(system_logs::Column::CreatedAt).lt(
                        sea_orm::sea_query::Func::cust("datetime")
                            .arg(sea_orm::sea_query::Expr::val("now"))
                            .arg(sea_orm::sea_query::Expr::val(format!(
                                "-{older_than_days} days"
                            ))),
                    ),
                ),
            )
            .exec(&self.conn)
            .await?;

        Ok(result.rows_affected)
    }

    pub async fn get_latest_event_time(&self, event_type: &str) -> Result<Option<String>> {
        let item = SystemLogs::find()
            .filter(system_logs::Column::EventType.eq(event_type))
            .order_by_desc(system_logs::Column::CreatedAt)
            .one(&self.conn)
            .await?;

        Ok(item.map(|m| m.created_at))
    }
}
