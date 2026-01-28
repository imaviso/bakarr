use sea_orm_migration::prelude::*;

mod m20240101_initial;
mod m20260118_remove_metadata_fk;
mod m20260121_add_sort_index;
mod m20260122_add_release_profiles;
mod m20260124_add_system_logs;
mod m20260127_add_users;
mod m20260128_add_anime_metadata;
mod m20260128_link_anime_release_profiles;

pub struct Migrator;

#[async_trait::async_trait]
impl MigratorTrait for Migrator {
    fn migrations() -> Vec<Box<dyn MigrationTrait>> {
        vec![
            Box::new(m20240101_initial::Migration),
            Box::new(m20260118_remove_metadata_fk::Migration),
            Box::new(m20260121_add_sort_index::Migration),
            Box::new(m20260122_add_release_profiles::Migration),
            Box::new(m20260124_add_system_logs::Migration),
            Box::new(m20260127_add_users::Migration),
            Box::new(m20260128_add_anime_metadata::Migration),
            Box::new(m20260128_link_anime_release_profiles::Migration),
        ]
    }
}
