use anyhow::{Context, Result};
use argon2::{
    Algorithm, Argon2, Params, Version,
    password_hash::{PasswordHash, PasswordHasher, PasswordVerifier, SaltString, rand_core::OsRng},
};
use sea_orm::{ActiveModelTrait, ColumnTrait, DatabaseConnection, EntityTrait, QueryFilter, Set};
use tokio::task;

use crate::config::SecurityConfig;
use crate::entities::users;

/// User data returned from repository (without sensitive password hash)
#[derive(Debug, Clone)]
pub struct User {
    pub id: i32,
    pub username: String,
    pub api_key: String,
    pub created_at: String,
    pub updated_at: String,
}

impl From<users::Model> for User {
    fn from(model: users::Model) -> Self {
        Self {
            id: model.id,
            username: model.username,
            api_key: model.api_key,
            created_at: model.created_at,
            updated_at: model.updated_at,
        }
    }
}

pub struct UserRepository {
    conn: DatabaseConnection,
}

impl UserRepository {
    #[must_use]
    pub const fn new(conn: DatabaseConnection) -> Self {
        Self { conn }
    }

    /// Get user by username
    pub async fn get_by_username(&self, username: &str) -> Result<Option<User>> {
        let user = users::Entity::find()
            .filter(users::Column::Username.eq(username))
            .one(&self.conn)
            .await
            .context("Failed to query user by username")?;

        Ok(user.map(User::from))
    }

    /// Get user by username with password hash (for password migration)
    pub async fn get_by_username_with_password(
        &self,
        username: &str,
    ) -> Result<Option<(User, String)>> {
        let user = users::Entity::find()
            .filter(users::Column::Username.eq(username))
            .one(&self.conn)
            .await
            .context("Failed to query user by username")?;

        Ok(user.map(|u| {
            let password_hash = u.password_hash.clone();
            (User::from(u), password_hash)
        }))
    }

    /// Get user by ID
    pub async fn get_by_id(&self, id: i32) -> Result<Option<User>> {
        let user = users::Entity::find_by_id(id)
            .one(&self.conn)
            .await
            .context("Failed to query user by ID")?;

        Ok(user.map(User::from))
    }

    /// Verify password for a user
    /// Note: This uses `spawn_blocking` because Argon2 hashing is CPU-intensive
    /// and would block the async runtime if run directly.
    pub async fn verify_password(&self, username: &str, password: &str) -> Result<bool> {
        let user = users::Entity::find()
            .filter(users::Column::Username.eq(username))
            .one(&self.conn)
            .await
            .context("Failed to query user for password verification")?;

        let Some(user) = user else {
            return Ok(false);
        };

        let password_hash = user.password_hash;
        let password = password.to_string();

        // Run CPU-intensive password verification in a blocking task
        let is_valid = task::spawn_blocking(move || {
            let parsed_hash = PasswordHash::new(&password_hash)
                .map_err(|e| anyhow::anyhow!("Invalid password hash format: {e}"))?;

            let argon2 = Argon2::default();
            Ok::<bool, anyhow::Error>(
                argon2
                    .verify_password(password.as_bytes(), &parsed_hash)
                    .is_ok(),
            )
        })
        .await
        .context("Password verification task panicked")??;

        Ok(is_valid)
    }

    /// Update password for a user (hashes the new password)
    pub async fn update_password(&self, username: &str, new_password: &str) -> Result<()> {
        let user = users::Entity::find()
            .filter(users::Column::Username.eq(username))
            .one(&self.conn)
            .await
            .context("Failed to query user for password update")?
            .ok_or_else(|| anyhow::anyhow!("User not found: {username}"))?;

        let password = new_password.to_string();
        // Use default params for manual password updates (config will be passed in auth service)
        let new_hash = task::spawn_blocking(move || hash_password(&password, None))
            .await
            .context("Password hashing task panicked")??;

        let now = chrono::Utc::now().to_rfc3339();

        let mut active: users::ActiveModel = user.into();
        active.password_hash = Set(new_hash);
        active.updated_at = Set(now);
        active.update(&self.conn).await?;

        Ok(())
    }

    /// Update password for a user with specific security config (used for auto-migration)
    pub async fn update_password_with_config(
        &self,
        username: &str,
        new_password: &str,
        config: &SecurityConfig,
    ) -> Result<()> {
        let user = users::Entity::find()
            .filter(users::Column::Username.eq(username))
            .one(&self.conn)
            .await
            .context("Failed to query user for password update")?
            .ok_or_else(|| anyhow::anyhow!("User not found: {username}"))?;

        let password = new_password.to_string();
        let config = config.clone();
        let new_hash = task::spawn_blocking(move || hash_password(&password, Some(&config)))
            .await
            .context("Password hashing task panicked")??;

        let now = chrono::Utc::now().to_rfc3339();

        let mut active: users::ActiveModel = user.into();
        active.password_hash = Set(new_hash);
        active.updated_at = Set(now);
        active.update(&self.conn).await?;

        Ok(())
    }

    /// Verify API key and return the associated user
    pub async fn verify_api_key(&self, api_key: &str) -> Result<Option<User>> {
        let user = users::Entity::find()
            .filter(users::Column::ApiKey.eq(api_key))
            .one(&self.conn)
            .await
            .context("Failed to query user by API key")?;

        Ok(user.map(User::from))
    }

    /// Get API key for a user
    pub async fn get_api_key(&self, username: &str) -> Result<Option<String>> {
        let user = users::Entity::find()
            .filter(users::Column::Username.eq(username))
            .one(&self.conn)
            .await
            .context("Failed to query user for API key")?;

        Ok(user.map(|u| u.api_key))
    }

    /// Regenerate API key for a user
    pub async fn regenerate_api_key(&self, username: &str) -> Result<String> {
        let user = users::Entity::find()
            .filter(users::Column::Username.eq(username))
            .one(&self.conn)
            .await
            .context("Failed to query user for API key regeneration")?
            .ok_or_else(|| anyhow::anyhow!("User not found: {username}"))?;

        let new_api_key = generate_api_key();
        let now = chrono::Utc::now().to_rfc3339();

        let mut active: users::ActiveModel = user.into();
        active.api_key = Set(new_api_key.clone());
        active.updated_at = Set(now);
        active.update(&self.conn).await?;

        Ok(new_api_key)
    }
}

/// Hash a password using Argon2id with optional custom params.
/// If config is None, uses default (high memory) params for backwards compatibility.
pub fn hash_password(password: &str, config: Option<&SecurityConfig>) -> Result<String> {
    let salt = SaltString::generate(&mut OsRng);

    let argon2 = if let Some(cfg) = config {
        let params = Params::new(
            cfg.argon2_memory_cost_kib,
            cfg.argon2_time_cost,
            cfg.argon2_parallelism,
            None, // output length (use default)
        )
        .map_err(|e| anyhow::anyhow!("Invalid Argon2 params: {e}"))?;
        Argon2::new(Algorithm::Argon2id, Version::V0x13, params)
    } else {
        Argon2::default()
    };

    let hash = argon2
        .hash_password(password.as_bytes(), &salt)
        .map_err(|e| anyhow::anyhow!("Failed to hash password: {e}"))?;

    Ok(hash.to_string())
}

/// Generate a random API key (64 character hex string)
#[must_use]
pub fn generate_api_key() -> String {
    use rand::Rng;

    let mut rng = rand::rng();
    let bytes: [u8; 32] = rng.random();

    bytes.iter().fold(String::with_capacity(64), |mut acc, b| {
        use std::fmt::Write;
        let _ = write!(acc, "{b:02x}");
        acc
    })
}
