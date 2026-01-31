//! `SeaORM` implementation of the `AuthService` trait.

use crate::db::Store;
use crate::services::auth_service::{AuthError, AuthService, LoginResult, UserInfo};
use async_trait::async_trait;

pub struct SeaOrmAuthService {
    store: Store,
}

impl SeaOrmAuthService {
    #[must_use]
    pub const fn new(store: Store) -> Self {
        Self { store }
    }
}

#[async_trait]
impl AuthService for SeaOrmAuthService {
    async fn login(&self, username: &str, password: &str) -> Result<LoginResult, AuthError> {
        // Verify credentials against database
        let is_valid = self.store
            .verify_user_password(username, password)
            .await?;

        if !is_valid {
            return Err(AuthError::InvalidCredentials);
        }

        // Get user info for response
        let user = self.store
            .get_user_by_username(username)
            .await?
            .ok_or(AuthError::UserNotFound)?;

        Ok(LoginResult {
            username: user.username,
            api_key: user.api_key,
        })
    }

    async fn verify_api_key(&self, api_key: &str) -> Result<Option<String>, AuthError> {
        let user = self.store.verify_api_key(api_key).await?;
        Ok(user.map(|u| u.username))
    }

    async fn get_user_info(&self, username: &str) -> Result<UserInfo, AuthError> {
        let user = self.store
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
        let is_valid = self.store
            .verify_user_password(username, current_password)
            .await?;

        if !is_valid {
            return Err(AuthError::Validation("Current password is incorrect".to_string()));
        }

        // Update password
        self.store
            .update_user_password(username, new_password)
            .await?;

        Ok(())
    }

    async fn get_api_key(&self, username: &str) -> Result<String, AuthError> {
        let api_key = self.store
            .get_user_api_key(username)
            .await?
            .ok_or_else(|| AuthError::Internal("API key not found".to_string()))?;

        Ok(api_key)
    }

    async fn regenerate_api_key(&self, username: &str) -> Result<String, AuthError> {
        let new_api_key = self.store
            .regenerate_user_api_key(username)
            .await?;

        Ok(new_api_key)
    }
}
