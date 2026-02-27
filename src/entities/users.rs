use sea_orm::entity::prelude::*;

#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel)]
#[sea_orm(table_name = "users")]
pub struct Model {
    #[sea_orm(primary_key)]
    pub id: i32,

    #[sea_orm(unique)]
    pub username: String,

    /// Argon2id password hash
    pub password_hash: String,

    /// Random API key (64-char hex string)
    pub api_key: String,

    /// Forces password rotation on first login/bootstrap.
    pub must_change_password: bool,

    pub created_at: String,

    pub updated_at: String,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {}

impl ActiveModelBehavior for ActiveModel {}
