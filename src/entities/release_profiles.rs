use sea_orm::entity::prelude::*;

#[derive(Clone, Debug, PartialEq, DeriveEntityModel)]
#[sea_orm(table_name = "release_profiles")]
pub struct Model {
    #[sea_orm(primary_key)]
    pub id: i32,
    #[sea_orm(unique)]
    pub name: String,
    pub enabled: bool,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {
    #[sea_orm(has_many = "super::release_profile_rules::Entity")]
    Rules,
}

impl Related<super::release_profile_rules::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Rules.def()
    }
}

impl ActiveModelBehavior for ActiveModel {}
