use sea_orm_migration::prelude::*;

mod m20240101_initial;
mod m20260118_remove_metadata_fk;
mod m20260121_add_sort_index;

pub struct Migrator;

#[async_trait::async_trait]
impl MigratorTrait for Migrator {
    fn migrations() -> Vec<Box<dyn MigrationTrait>> {
        vec![
            Box::new(m20240101_initial::Migration),
            Box::new(m20260118_remove_metadata_fk::Migration),
            Box::new(m20260121_add_sort_index::Migration),
        ]
    }
}
