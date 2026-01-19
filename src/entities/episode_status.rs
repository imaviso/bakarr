use sea_orm::entity::prelude::*;

#[derive(Clone, Debug, PartialEq, DeriveEntityModel)]
#[sea_orm(table_name = "episode_status")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub anime_id: i32,
    #[sea_orm(primary_key, auto_increment = false)]
    pub episode_number: i32,
    pub season: i32,
    pub monitored: bool,
    pub quality_id: Option<i32>,
    pub is_seadex: bool,
    pub file_path: Option<String>,
    pub file_size: Option<i64>,
    pub downloaded_at: Option<String>,
    pub resolution_width: Option<i32>,
    pub resolution_height: Option<i32>,
    pub video_codec: Option<String>,
    pub audio_codecs: Option<String>,
    pub duration_secs: Option<f32>,
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
    #[sea_orm(
        belongs_to = "super::quality_definitions::Entity",
        from = "Column::QualityId",
        to = "super::quality_definitions::Column::Id",
        on_update = "NoAction",
        on_delete = "NoAction"
    )]
    QualityDefinitions,
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
