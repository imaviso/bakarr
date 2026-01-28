use sea_orm::entity::prelude::*;

#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel)]
#[sea_orm(table_name = "search_cache")]
pub struct Model {
    #[sea_orm(primary_key)]
    pub id: i32,
    pub query: String,
    #[sea_orm(column_type = "Text")]
    pub results_json: String,
    pub created_at: String, // SQLite doesn't strictly enforce types, but typically strings for ISO8601
    pub expires_at: String,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {}

impl ActiveModelBehavior for ActiveModel {}
