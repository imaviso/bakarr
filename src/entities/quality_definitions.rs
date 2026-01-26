use sea_orm::entity::prelude::*;

#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel)]
#[sea_orm(table_name = "quality_definitions")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: i32,
    pub name: String,
    pub source: String,
    pub resolution: i32,
    pub rank: i32,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {
    #[sea_orm(has_many = "super::quality_profiles::Entity")]
    QualityProfiles,
    #[sea_orm(has_many = "super::quality_profile_items::Entity")]
    QualityProfileItems,
    #[sea_orm(has_many = "super::release_history::Entity")]
    ReleaseHistory,
    #[sea_orm(has_many = "super::episode_status::Entity")]
    EpisodeStatus,
    #[sea_orm(has_many = "super::recycle_bin::Entity")]
    RecycleBin,
}

impl Related<super::quality_profiles::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::QualityProfiles.def()
    }
}

impl Related<super::quality_profile_items::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::QualityProfileItems.def()
    }
}

impl Related<super::release_history::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::ReleaseHistory.def()
    }
}

impl Related<super::episode_status::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::EpisodeStatus.def()
    }
}

impl Related<super::recycle_bin::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::RecycleBin.def()
    }
}

impl ActiveModelBehavior for ActiveModel {}
