//! `SeaORM` implementation of the `AuthService` trait.

use crate::config::SecurityConfig;
use crate::db::Store;
use crate::services::auth_service::{AuthError, AuthService, LoginResult, UserInfo};
use async_trait::async_trait;
use std::sync::Arc;
use tokio::sync::RwLock;

pub struct SeaOrmAuthService {
    store: Store,
    config: Arc<RwLock<crate::config::Config>>,
}

impl SeaOrmAuthService {
    #[must_use]
    pub const fn new(store: Store, config: Arc<RwLock<crate::config::Config>>) -> Self {
        Self { store, config }
    }

    /// Check if a password hash needs migration to new argon2 params.
    /// Parses the hash string to extract the m (memory), t (time), and p (parallelism) params.
    fn needs_migration(hash: &str, security_cfg: &SecurityConfig) -> bool {
        // Argon2 hash format: $argon2id$v=19$m=8192,t=3,p=1$...
        let parts: Vec<&str> = hash.split('$').collect();
        if parts.len() < 4 {
            return true; // Invalid hash, needs re-hash
        }

        let params_part = parts[3];
        let mut current_m: Option<u32> = None;
        let mut current_t: Option<u32> = None;
        let mut current_p: Option<u32> = None;

        for param in params_part.split(',') {
            if let Some(value) = param.strip_prefix("m=") {
                current_m = value.parse().ok();
            } else if let Some(value) = param.strip_prefix("t=") {
                current_t = value.parse().ok();
            } else if let Some(value) = param.strip_prefix("p=") {
                current_p = value.parse().ok();
            }
        }

        // If we can't parse params, assume it needs migration
        let current_m = current_m.unwrap_or(0);
        let current_t = current_t.unwrap_or(0);
        let current_p = current_p.unwrap_or(1);

        // Check if params differ from config
        current_m != security_cfg.argon2_memory_cost_kib
            || current_t != security_cfg.argon2_time_cost
            || current_p != security_cfg.argon2_parallelism
    }
}

#[async_trait]
impl AuthService for SeaOrmAuthService {
    async fn login(&self, username: &str, password: &str) -> Result<LoginResult, AuthError> {
        // Get the user with password hash for potential migration
        let user_with_hash = self
            .store
            .user_repo()
            .get_by_username_with_password(username)
            .await
            .map_err(|e| AuthError::Internal(e.to_string()))?;

        let Some((user, password_hash)) = user_with_hash else {
            return Err(AuthError::InvalidCredentials);
        };

        // Verify credentials against database
        let is_valid = self.store.verify_user_password(username, password).await?;

        if !is_valid {
            return Err(AuthError::InvalidCredentials);
        }

        // Check if password hash needs migration to new params
        let config = self.config.read().await;
        let security_cfg = &config.security;

        if security_cfg.auto_migrate_password_hashes
            && Self::needs_migration(&password_hash, security_cfg)
        {
            tracing::info!(
                "Migrating password hash for user '{}' to new argon2 params (m={}, t={}, p={})",
                username,
                security_cfg.argon2_memory_cost_kib,
                security_cfg.argon2_time_cost,
                security_cfg.argon2_parallelism
            );
            // Re-hash with new params in background - don't block login
            let store = self.store.clone();
            let username = username.to_string();
            let password = password.to_string();
            let security_cfg = security_cfg.clone();
            tokio::spawn(async move {
                if let Err(e) = store
                    .user_repo()
                    .update_password_with_config(&username, &password, &security_cfg)
                    .await
                {
                    tracing::warn!(
                        "Failed to auto-migrate password hash for '{}': {}",
                        username,
                        e
                    );
                } else {
                    tracing::info!("Successfully migrated password hash for '{}'", username);
                }
            });
        }
        drop(config); // Release lock

        Ok(LoginResult {
            username: user.username,
            api_key: user.api_key,
            must_change_password: user.must_change_password,
        })
    }

    async fn verify_api_key(&self, api_key: &str) -> Result<Option<String>, AuthError> {
        let user = self.store.verify_api_key(api_key).await?;
        Ok(user.map(|u| u.username))
    }

    async fn get_user_info(&self, username: &str) -> Result<UserInfo, AuthError> {
        let user = self
            .store
            .get_user_by_username(username)
            .await?
            .ok_or(AuthError::UserNotFound)?;

        Ok(UserInfo {
            username: user.username,
            created_at: user.created_at,
            updated_at: user.updated_at,
        })
    }

    async fn change_password(
        &self,
        username: &str,
        current_password: &str,
        new_password: &str,
    ) -> Result<(), AuthError> {
        // Validate new password
        if new_password.len() < 8 {
            return Err(AuthError::Validation(
                "New password must be at least 8 characters".to_string(),
            ));
        }

        if current_password == new_password {
            return Err(AuthError::Validation(
                "New password must be different from current password".to_string(),
            ));
        }

        // Verify current password
        let is_valid = self
            .store
            .verify_user_password(username, current_password)
            .await?;

        if !is_valid {
            return Err(AuthError::IncorrectPassword);
        }

        // Update password
        self.store
            .update_user_password(username, new_password)
            .await?;

        Ok(())
    }

    async fn get_api_key(&self, username: &str) -> Result<String, AuthError> {
        let api_key = self
            .store
            .get_user_api_key(username)
            .await?
            .ok_or_else(|| AuthError::Internal("API key not found".to_string()))?;

        Ok(api_key)
    }

    async fn regenerate_api_key(&self, username: &str) -> Result<String, AuthError> {
        let new_api_key = self.store.regenerate_user_api_key(username).await?;

        Ok(new_api_key)
    }
}
