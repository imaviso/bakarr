use sea_orm::entity::prelude::*;

#[derive(Clone, Debug, PartialEq, DeriveEntityModel)]
#[sea_orm(table_name = "episode_metadata")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub anime_id: i32,
    #[sea_orm(primary_key, auto_increment = false)]
    pub episode_number: i32,
    pub title: Option<String>,
    pub title_japanese: Option<String>,
    pub aired: Option<String>,
    pub filler: bool,
    pub recap: bool,
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
