use sea_orm::entity::prelude::*;

#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel)]
#[sea_orm(table_name = "anime_release_profiles")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub anime_id: i32,
    #[sea_orm(primary_key, auto_increment = false)]
    pub profile_id: i32,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {
    #[sea_orm(
        belongs_to = "super::monitored_anime::Entity",
        from = "Column::AnimeId",
        to = "super::monitored_anime::Column::Id",
        on_update = "Cascade",
        on_delete = "Cascade"
    )]
    MonitoredAnime,
    #[sea_orm(
        belongs_to = "super::release_profiles::Entity",
        from = "Column::ProfileId",
        to = "super::release_profiles::Column::Id",
        on_update = "Cascade",
        on_delete = "Cascade"
    )]
    ReleaseProfile,
}

impl Related<super::monitored_anime::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::MonitoredAnime.def()
    }
}

impl Related<super::release_profiles::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::ReleaseProfile.def()
    }
}

impl ActiveModelBehavior for ActiveModel {}
