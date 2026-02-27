use crate::entities::prelude::*;
use sea_orm_migration::prelude::*;
use sea_orm_migration::sea_orm::Schema;
use std::fmt::Write;

#[derive(DeriveMigrationName)]
pub struct Migration;

const DEFAULT_BOOTSTRAP_USERNAME: &str = "admin";
const ENV_BOOTSTRAP_USERNAME: &str = "BAKARR_BOOTSTRAP_ADMIN_USERNAME";
const ENV_BOOTSTRAP_PASSWORD: &str = "BAKARR_BOOTSTRAP_ADMIN_PASSWORD";
const ENV_BOOTSTRAP_API_KEY: &str = "BAKARR_BOOTSTRAP_ADMIN_API_KEY";

struct BootstrapCredentials {
    username: String,
    password: String,
    api_key: String,
    generated_password: bool,
    generated_api_key: bool,
}

fn read_non_empty_env(key: &str) -> Option<String> {
    std::env::var(key)
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

fn random_hex(byte_len: usize) -> String {
    use rand::Rng;

    let mut rng = rand::rng();
    let mut result = String::with_capacity(byte_len * 2);

    for _ in 0..byte_len {
        let value: u8 = rng.random();
        let _ = write!(result, "{value:02x}");
    }

    result
}

fn resolve_bootstrap_credentials() -> BootstrapCredentials {
    let username = read_non_empty_env(ENV_BOOTSTRAP_USERNAME)
        .unwrap_or_else(|| DEFAULT_BOOTSTRAP_USERNAME.to_string());

    let password = read_non_empty_env(ENV_BOOTSTRAP_PASSWORD).unwrap_or_else(|| random_hex(16));
    let generated_password = std::env::var(ENV_BOOTSTRAP_PASSWORD).is_err();

    let api_key = read_non_empty_env(ENV_BOOTSTRAP_API_KEY).unwrap_or_else(|| random_hex(32));
    let generated_api_key = std::env::var(ENV_BOOTSTRAP_API_KEY).is_err();

    BootstrapCredentials {
        username,
        password,
        api_key,
        generated_password,
        generated_api_key,
    }
}

fn hash_password(password: &str) -> Result<String, DbErr> {
    use argon2::{
        Argon2,
        password_hash::{PasswordHasher, SaltString, rand_core::OsRng},
    };

    let salt = SaltString::generate(&mut OsRng);
    let argon2 = Argon2::default();

    argon2
        .hash_password(password.as_bytes(), &salt)
        .map(|hash| hash.to_string())
        .map_err(|err| DbErr::Custom(format!("Failed to hash bootstrap password: {err}")))
}

#[allow(clippy::too_many_lines)]
#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let backend = manager.get_database_backend();
        let schema = Schema::new(backend);

        manager
            .create_table(
                schema
                    .create_table_from_entity(QualityDefinitions)
                    .if_not_exists()
                    .to_owned(),
            )
            .await?;

        manager
            .create_table(
                schema
                    .create_table_from_entity(QualityProfiles)
                    .if_not_exists()
                    .to_owned(),
            )
            .await?;

        manager
            .create_table(
                schema
                    .create_table_from_entity(QualityProfileItems)
                    .if_not_exists()
                    .to_owned(),
            )
            .await?;

        manager
            .create_table(
                schema
                    .create_table_from_entity(ReleaseProfiles)
                    .if_not_exists()
                    .to_owned(),
            )
            .await?;

        manager
            .create_table(
                schema
                    .create_table_from_entity(ReleaseProfileRules)
                    .if_not_exists()
                    .to_owned(),
            )
            .await?;

        manager
            .create_table(
                schema
                    .create_table_from_entity(Blocklist)
                    .if_not_exists()
                    .to_owned(),
            )
            .await?;

        manager
            .create_table(
                schema
                    .create_table_from_entity(MonitoredAnime)
                    .if_not_exists()
                    .to_owned(),
            )
            .await?;

        manager
            .create_table(
                schema
                    .create_table_from_entity(AnimeReleaseProfiles)
                    .if_not_exists()
                    .to_owned(),
            )
            .await?;

        manager
            .create_table(
                schema
                    .create_table_from_entity(EpisodeStatus)
                    .if_not_exists()
                    .to_owned(),
            )
            .await?;

        manager
            .create_table(
                schema
                    .create_table_from_entity(EpisodeMetadata)
                    .if_not_exists()
                    .to_owned(),
            )
            .await?;

        manager
            .create_table(
                schema
                    .create_table_from_entity(ReleaseHistory)
                    .if_not_exists()
                    .to_owned(),
            )
            .await?;

        manager
            .create_table(
                schema
                    .create_table_from_entity(RssFeeds)
                    .if_not_exists()
                    .to_owned(),
            )
            .await?;

        manager
            .create_table(
                schema
                    .create_table_from_entity(RecycleBin)
                    .if_not_exists()
                    .to_owned(),
            )
            .await?;

        manager
            .create_table(
                schema
                    .create_table_from_entity(SeadexCache)
                    .if_not_exists()
                    .to_owned(),
            )
            .await?;

        manager
            .create_table(
                schema
                    .create_table_from_entity(AnimeMetadata)
                    .if_not_exists()
                    .to_owned(),
            )
            .await?;

        manager
            .create_table(
                schema
                    .create_table_from_entity(SearchCache)
                    .if_not_exists()
                    .to_owned(),
            )
            .await?;

        manager
            .create_table(
                schema
                    .create_table_from_entity(SystemLogs)
                    .if_not_exists()
                    .to_owned(),
            )
            .await?;

        manager
            .create_table(
                schema
                    .create_table_from_entity(Users)
                    .if_not_exists()
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("idx_search_cache_query_unique")
                    .table(SearchCache)
                    .col(crate::entities::search_cache::Column::Query)
                    .unique()
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("idx_system_logs_created_at")
                    .table(SystemLogs)
                    .col(crate::entities::system_logs::Column::CreatedAt)
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("idx_release_history_info_hash_unique")
                    .table(ReleaseHistory)
                    .col(crate::entities::release_history::Column::InfoHash)
                    .unique()
                    .to_owned(),
            )
            .await?;

        let creds = resolve_bootstrap_credentials();
        let now = chrono::Utc::now().to_rfc3339();
        let password_hash = hash_password(&creds.password)?;

        let insert = sea_orm_migration::sea_query::Query::insert()
            .into_table(Users)
            .columns([
                crate::entities::users::Column::Username,
                crate::entities::users::Column::PasswordHash,
                crate::entities::users::Column::ApiKey,
                crate::entities::users::Column::MustChangePassword,
                crate::entities::users::Column::CreatedAt,
                crate::entities::users::Column::UpdatedAt,
            ])
            .values_panic([
                creds.username.clone().into(),
                password_hash.into(),
                creds.api_key.clone().into(),
                true.into(),
                now.clone().into(),
                now.into(),
            ])
            .to_owned();

        manager.exec_stmt(insert).await?;

        if creds.generated_password || creds.generated_api_key {
            let password_display = if creds.generated_password {
                creds.password.as_str()
            } else {
                "[provided-via-env]"
            };
            let api_key_display = if creds.generated_api_key {
                creds.api_key.as_str()
            } else {
                "[provided-via-env]"
            };

            tracing::warn!(
                "Generated bootstrap admin credentials. Save these now; they are shown only during first migration. username='{}' password='{}' api_key='{}'",
                creds.username,
                password_display,
                api_key_display
            );
        }

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .drop_table(Table::drop().table(Users).to_owned())
            .await?;
        manager
            .drop_table(Table::drop().table(SystemLogs).to_owned())
            .await?;
        manager
            .drop_table(Table::drop().table(SearchCache).to_owned())
            .await?;
        manager
            .drop_table(Table::drop().table(AnimeMetadata).to_owned())
            .await?;
        manager
            .drop_table(Table::drop().table(SeadexCache).to_owned())
            .await?;
        manager
            .drop_table(Table::drop().table(RecycleBin).to_owned())
            .await?;
        manager
            .drop_table(Table::drop().table(RssFeeds).to_owned())
            .await?;
        manager
            .drop_table(Table::drop().table(ReleaseHistory).to_owned())
            .await?;
        manager
            .drop_table(Table::drop().table(EpisodeMetadata).to_owned())
            .await?;
        manager
            .drop_table(Table::drop().table(EpisodeStatus).to_owned())
            .await?;
        manager
            .drop_table(Table::drop().table(AnimeReleaseProfiles).to_owned())
            .await?;
        manager
            .drop_table(Table::drop().table(MonitoredAnime).to_owned())
            .await?;
        manager
            .drop_table(Table::drop().table(ReleaseProfileRules).to_owned())
            .await?;
        manager
            .drop_table(Table::drop().table(ReleaseProfiles).to_owned())
            .await?;
        manager
            .drop_table(Table::drop().table(QualityProfileItems).to_owned())
            .await?;
        manager
            .drop_table(Table::drop().table(QualityProfiles).to_owned())
            .await?;
        manager
            .drop_table(Table::drop().table(QualityDefinitions).to_owned())
            .await?;

        Ok(())
    }
}
