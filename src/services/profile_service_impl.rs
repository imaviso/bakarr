//! `SeaORM` implementation of the `ProfileService` trait.

use crate::api::types::{ProfileDto, QualityDto};
use crate::config::{Config, QualityProfileConfig};
use crate::db::Store;
use crate::services::profile_service::{
    ProfileError, ProfileService, ReleaseProfileDto, ReleaseProfileRuleDtoPublic,
};
use async_trait::async_trait;
use std::sync::Arc;
use tokio::sync::RwLock;

pub struct SeaOrmProfileService {
    store: Store,
    config: Arc<RwLock<Config>>,
}

impl SeaOrmProfileService {
    #[must_use]
    pub const fn new(store: Store, config: Arc<RwLock<Config>>) -> Self {
        Self { store, config }
    }

    fn validate_quality_dto(payload: &ProfileDto) -> Result<(), ProfileError> {
        if crate::quality::definition::get_quality_by_name(&payload.cutoff).is_none() {
            return Err(ProfileError::Validation(format!(
                "Invalid cutoff quality: {}",
                payload.cutoff
            )));
        }
        for q in &payload.allowed_qualities {
            if crate::quality::definition::get_quality_by_name(q).is_none() {
                return Err(ProfileError::Validation(format!("Invalid quality: {q}")));
            }
        }
        Ok(())
    }
}

#[async_trait]
impl ProfileService for SeaOrmProfileService {
    async fn list_qualities(&self) -> Result<Vec<QualityDto>, ProfileError> {
        let qualities = crate::quality::QUALITIES
            .iter()
            .filter(|q| q.id != 99)
            .map(|q| QualityDto {
                id: q.id,
                name: q.name.clone(),
                source: q.source.as_str().to_string(),
                resolution: q.resolution,
                rank: q.rank,
            })
            .collect();

        Ok(qualities)
    }

    async fn list_quality_profiles(&self) -> Result<Vec<ProfileDto>, ProfileError> {
        let profiles = self
            .config
            .read()
            .await
            .profiles
            .iter()
            .map(|p| ProfileDto {
                name: p.name.clone(),
                cutoff: p.cutoff.clone(),
                upgrade_allowed: p.upgrade_allowed,
                seadex_preferred: p.seadex_preferred,
                allowed_qualities: p.allowed_qualities.clone(),
                min_size: p.min_size.clone(),
                max_size: p.max_size.clone(),
            })
            .collect();

        Ok(profiles)
    }

    async fn get_quality_profile(&self, name: &str) -> Result<ProfileDto, ProfileError> {
        let profile = {
            let config = self.config.read().await;
            config
                .find_profile(name)
                .cloned()
                .ok_or_else(|| ProfileError::NotFound(name.to_string()))?
        };

        Ok(ProfileDto {
            name: profile.name,
            cutoff: profile.cutoff,
            upgrade_allowed: profile.upgrade_allowed,
            seadex_preferred: profile.seadex_preferred,
            allowed_qualities: profile.allowed_qualities,
            min_size: profile.min_size,
            max_size: profile.max_size,
        })
    }

    async fn create_quality_profile(
        &self,
        payload: ProfileDto,
    ) -> Result<ProfileDto, ProfileError> {
        Self::validate_quality_dto(&payload)?;

        let profiles = {
            let mut config = self.config.write().await;

            let profile = QualityProfileConfig {
                name: payload.name.clone(),
                cutoff: payload.cutoff.clone(),
                upgrade_allowed: payload.upgrade_allowed,
                seadex_preferred: payload.seadex_preferred,
                allowed_qualities: payload.allowed_qualities.clone(),
                min_size: payload.min_size.clone(),
                max_size: payload.max_size.clone(),
            };

            config
                .add_profile(profile)
                .map_err(|e| ProfileError::Conflict(e.to_string()))?;

            config.profiles.clone()
        };

        // Sync to DB
        self.store.sync_profiles(&profiles).await?;

        Ok(payload)
    }

    async fn update_quality_profile(
        &self,
        name: &str,
        payload: ProfileDto,
    ) -> Result<ProfileDto, ProfileError> {
        Self::validate_quality_dto(&payload)?;

        let profiles = {
            let mut config = self.config.write().await;

            let profile = QualityProfileConfig {
                name: payload.name.clone(),
                cutoff: payload.cutoff.clone(),
                upgrade_allowed: payload.upgrade_allowed,
                seadex_preferred: payload.seadex_preferred,
                allowed_qualities: payload.allowed_qualities.clone(),
                min_size: payload.min_size.clone(),
                max_size: payload.max_size.clone(),
            };

            config
                .update_profile(name, profile)
                .map_err(|e| ProfileError::NotFound(e.to_string()))?;

            config.profiles.clone()
        };

        // Sync to DB
        self.store.sync_profiles(&profiles).await?;

        Ok(payload)
    }

    async fn delete_quality_profile(&self, name: &str) -> Result<(), ProfileError> {
        self.config
            .write()
            .await
            .delete_profile(name)
            .map_err(|e| ProfileError::Validation(e.to_string()))?;

        Ok(())
    }

    async fn list_release_profiles(&self) -> Result<Vec<ReleaseProfileDto>, ProfileError> {
        let profiles = self.store.list_release_profiles().await?;

        let dtos = profiles
            .into_iter()
            .map(|(p, rules)| ReleaseProfileDto {
                id: p.id,
                name: p.name,
                enabled: p.enabled,
                is_global: p.is_global,
                rules: rules
                    .into_iter()
                    .map(|r| ReleaseProfileRuleDtoPublic {
                        term: r.term,
                        score: r.score,
                        rule_type: r.rule_type,
                    })
                    .collect(),
            })
            .collect();

        Ok(dtos)
    }

    async fn create_release_profile(
        &self,
        name: String,
        enabled: bool,
        is_global: bool,
        rules: Vec<ReleaseProfileRuleDtoPublic>,
    ) -> Result<ReleaseProfileDto, ProfileError> {
        let rule_dtos: Vec<crate::db::repositories::release_profile::ReleaseProfileRuleDto> = rules
            .into_iter()
            .map(
                |r| crate::db::repositories::release_profile::ReleaseProfileRuleDto {
                    term: r.term,
                    score: r.score,
                    rule_type: r.rule_type,
                },
            )
            .collect();

        let profile = self
            .store
            .create_release_profile(name, enabled, is_global, rule_dtos)
            .await?;

        // Fetch back with rules
        let all = self.store.list_release_profiles().await?;
        let (p, r) = all
            .into_iter()
            .find(|(p, _)| p.id == profile.id)
            .ok_or_else(|| ProfileError::Internal("Failed to fetch created profile".to_string()))?;

        Ok(ReleaseProfileDto {
            id: p.id,
            name: p.name,
            enabled: p.enabled,
            is_global: p.is_global,
            rules: r
                .into_iter()
                .map(|rule| ReleaseProfileRuleDtoPublic {
                    term: rule.term,
                    score: rule.score,
                    rule_type: rule.rule_type,
                })
                .collect(),
        })
    }

    async fn update_release_profile(
        &self,
        id: i32,
        name: String,
        enabled: bool,
        is_global: bool,
        rules: Vec<ReleaseProfileRuleDtoPublic>,
    ) -> Result<(), ProfileError> {
        let rule_dtos: Vec<crate::db::repositories::release_profile::ReleaseProfileRuleDto> = rules
            .into_iter()
            .map(
                |r| crate::db::repositories::release_profile::ReleaseProfileRuleDto {
                    term: r.term,
                    score: r.score,
                    rule_type: r.rule_type,
                },
            )
            .collect();

        self.store
            .update_release_profile(id, name, enabled, is_global, rule_dtos)
            .await?;

        Ok(())
    }

    async fn delete_release_profile(&self, id: i32) -> Result<(), ProfileError> {
        self.store.delete_release_profile(id).await?;
        Ok(())
    }
}
