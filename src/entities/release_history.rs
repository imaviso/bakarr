use sea_orm::entity::prelude::*;

#[derive(Clone, Debug, PartialEq, DeriveEntityModel)]
#[sea_orm(table_name = "release_history")]
pub struct Model {
    #[sea_orm(primary_key)]
    pub id: i32,
    pub anime_id: i32,
    pub filename: String,
    pub episode_number: f32,
    pub group_name: Option<String>,
    pub download_date: Option<String>,
    pub info_hash: Option<String>,
    pub imported: bool,
    pub quality_id: Option<i32>,
    pub is_seadex: Option<bool>,
    pub superseded_by: Option<i32>,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {
    #[sea_orm(
        belongs_to = "super::monitored_anime::Entity",
        from = "Column::AnimeId",
        to = "super::monitored_anime::Column::Id",
        on_update = "NoAction",
        on_delete = "NoAction"
    )]
    MonitoredAnime,
    #[sea_orm(
        belongs_to = "super::quality_definitions::Entity",
        from = "Column::QualityId",
        to = "super::quality_definitions::Column::Id",
        on_update = "NoAction",
        on_delete = "NoAction"
    )]
    QualityDefinitions,
    #[sea_orm(
        belongs_to = "Entity",
        from = "Column::SupersededBy",
        to = "Column::Id",
        on_update = "NoAction",
        on_delete = "NoAction"
    )]
    SelfRef,
}

impl Related<super::monitored_anime::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::MonitoredAnime.def()
    }
}

impl Related<super::quality_definitions::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::QualityDefinitions.def()
    }
}

impl ActiveModelBehavior for ActiveModel {}
