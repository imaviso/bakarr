use sea_orm::entity::prelude::*;

#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel)]
#[sea_orm(table_name = "quality_profiles")]
pub struct Model {
    #[sea_orm(primary_key)]
    pub id: i32,
    #[sea_orm(unique)]
    pub name: String,
    pub cutoff_quality_id: i32,
    pub upgrade_allowed: bool,
    pub seadex_preferred: bool,
    pub min_size: Option<i64>,
    pub max_size: Option<i64>,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {
    #[sea_orm(
        belongs_to = "super::quality_definitions::Entity",
        from = "Column::CutoffQualityId",
        to = "super::quality_definitions::Column::Id",
        on_update = "NoAction",
        on_delete = "NoAction"
    )]
    QualityDefinitions,
    #[sea_orm(has_many = "super::monitored_anime::Entity")]
    MonitoredAnime,
    #[sea_orm(has_many = "super::quality_profile_items::Entity")]
    QualityProfileItems,
}

impl Related<super::quality_definitions::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::QualityDefinitions.def()
    }
}

impl Related<super::monitored_anime::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::MonitoredAnime.def()
    }
}

impl Related<super::quality_profile_items::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::QualityProfileItems.def()
    }
}

impl ActiveModelBehavior for ActiveModel {}
