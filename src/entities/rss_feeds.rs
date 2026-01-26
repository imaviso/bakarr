use sea_orm::entity::prelude::*;

#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel)]
#[sea_orm(table_name = "rss_feeds")]
pub struct Model {
    #[sea_orm(primary_key)]
    pub id: i32,
    pub anime_id: i32,
    pub url: String,
    pub name: Option<String>,
    pub last_checked: Option<String>,
    pub last_item_hash: Option<String>,
    pub enabled: bool,
    pub created_at: Option<String>,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {
    #[sea_orm(
        belongs_to = "super::monitored_anime::Entity",
        from = "Column::AnimeId",
        to = "super::monitored_anime::Column::Id",
        on_update = "NoAction",
        on_delete = "Cascade"
    )]
    MonitoredAnime,
}

impl Related<super::monitored_anime::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::MonitoredAnime.def()
    }
}

impl ActiveModelBehavior for ActiveModel {}
