use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel, Serialize, Deserialize)]
#[sea_orm(table_name = "release_profile_rules")]
pub struct Model {
    #[sea_orm(primary_key)]
    pub id: i32,
    pub profile_id: i32,
    pub term: String,
    pub score: i32,
    pub rule_type: String,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {
    #[sea_orm(
        belongs_to = "super::release_profiles::Entity",
        from = "Column::ProfileId",
        to = "super::release_profiles::Column::Id",
        on_update = "Cascade",
        on_delete = "Cascade"
    )]
    ReleaseProfile,
}

impl Related<super::release_profiles::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::ReleaseProfile.def()
    }
}

impl ActiveModelBehavior for ActiveModel {}
