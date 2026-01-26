use sea_orm::entity::prelude::*;

#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel)]
#[sea_orm(table_name = "recycle_bin")]
pub struct Model {
    #[sea_orm(primary_key)]
    pub id: i32,
    pub original_path: String,
    pub recycled_path: Option<String>,
    pub anime_id: i32,
    pub episode_number: i32,
    pub quality_id: Option<i32>,
    pub file_size: Option<i64>,
    pub deleted_at: String,
    pub reason: String,
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
