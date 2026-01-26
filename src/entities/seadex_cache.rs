use sea_orm::entity::prelude::*;

#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel)]
#[sea_orm(table_name = "seadex_cache")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub anime_id: i32,
    pub groups: String,
    pub best_release: Option<String>,
    pub releases: String,
    pub fetched_at: String,
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
