use crate::entities::prelude::*;
use sea_orm_migration::prelude::*;
use sea_orm_migration::sea_orm::Schema;

#[derive(DeriveMigrationName)]
pub struct Migration;

/// Default API key (will be regenerated on first use if desired)
const DEFAULT_API_KEY: &str = "bakarr_default_api_key_please_regenerate";

/// Hash the default password using Argon2id
fn hash_default_password() -> String {
    use argon2::{
        Argon2,
        password_hash::{PasswordHasher, SaltString, rand_core::OsRng},
    };

    let password = b"password";
    let salt = SaltString::generate(&mut OsRng);
    let argon2 = Argon2::default();

    argon2
        .hash_password(password, &salt)
        .expect("Failed to hash default password")
        .to_string()
}

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let backend = manager.get_database_backend();
        let schema = Schema::new(backend);

        // Create users table
        manager
            .create_table(
                schema
                    .create_table_from_entity(Users)
                    .if_not_exists()
                    .to_owned(),
            )
            .await?;

        // Seed default admin user with hashed password
        let now = chrono::Utc::now().to_rfc3339();
        let password_hash = hash_default_password();

        let insert = sea_orm_migration::sea_query::Query::insert()
            .into_table(Users)
            .columns([
                crate::entities::users::Column::Username,
                crate::entities::users::Column::PasswordHash,
                crate::entities::users::Column::ApiKey,
                crate::entities::users::Column::CreatedAt,
                crate::entities::users::Column::UpdatedAt,
            ])
            .values_panic([
                "admin".into(),
                password_hash.into(),
                DEFAULT_API_KEY.into(),
                now.clone().into(),
                now.into(),
            ])
            .to_owned();

        manager.exec_stmt(insert).await?;

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .drop_table(Table::drop().table(Users).to_owned())
            .await?;

        Ok(())
    }
}
