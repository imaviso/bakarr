use sea_orm::entity::prelude::*;

#[derive(Clone, Debug, PartialEq, DeriveEntityModel)]
#[sea_orm(table_name = "quality_profile_items")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub profile_id: i32,
    #[sea_orm(primary_key, auto_increment = false)]
    pub quality_id: i32,
    pub allowed: bool,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {
    #[sea_orm(
        belongs_to = "super::quality_profiles::Entity",
        from = "Column::ProfileId",
        to = "super::quality_profiles::Column::Id",
        on_update = "NoAction",
        on_delete = "Cascade"
    )]
    QualityProfiles,
    #[sea_orm(
        belongs_to = "super::quality_definitions::Entity",
        from = "Column::QualityId",
        to = "super::quality_definitions::Column::Id",
        on_update = "NoAction",
        on_delete = "NoAction"
    )]
    QualityDefinitions,
}

impl Related<super::quality_profiles::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::QualityProfiles.def()
    }
}

impl Related<super::quality_definitions::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::QualityDefinitions.def()
    }
}

impl ActiveModelBehavior for ActiveModel {}
