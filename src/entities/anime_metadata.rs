use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel, Serialize, Deserialize)]
#[sea_orm(table_name = "anime_metadata")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: i32,
    #[sea_orm(indexed)]
    pub anilist_id: Option<i32>,
    #[sea_orm(indexed)]
    pub mal_id: Option<i32>,
    pub anidb_id: Option<i32>,
    pub kitsu_id: Option<i32>,
    pub title: String,
    pub synonyms: Option<String>, // JSON array stored as string
    pub r#type: Option<String>,
    pub status: Option<String>,
    pub season: Option<String>,
    pub year: Option<i32>,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {}

impl ActiveModelBehavior for ActiveModel {}
