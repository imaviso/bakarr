use crate::db::{EpisodeStatusRow, Store};
use crate::quality::profile::EpisodeQualityInfo;
use crate::quality::{Quality, QualityProfile, parse_quality_from_filename};
use anyhow::Result;
use tracing::debug;

#[derive(Clone)]
pub struct DownloadDecisionService {
    store: Store,
}

impl DownloadDecisionService {
    pub fn new(store: Store) -> Self {
        Self { store }
    }

    pub async fn should_download(
        &self,
        anime_id: i32,
        episode_number: i32,
        release_title: &str,
        is_seadex_group: bool,
    ) -> Result<DownloadAction> {
        let current_status = self
            .store
            .get_episode_status(anime_id, episode_number)
            .await?;

        let profile = self.get_quality_profile_for_anime(anime_id).await?;

        Ok(self.decide_download(
            &profile,
            current_status.as_ref(),
            release_title,
            is_seadex_group,
        ))
    }

    pub fn decide_download(
        &self,
        profile: &QualityProfile,
        current_status: Option<&EpisodeStatusRow>,
        release_title: &str,
        is_seadex_group: bool,
    ) -> DownloadAction {
        let release_quality = parse_quality_from_filename(release_title);
        debug!(
            "Release quality for '{}': {} (rank {})",
            release_title, release_quality, release_quality.rank
        );

        let Some(current) = current_status else {
            return DownloadAction::Accept {
                quality: release_quality,
                is_seadex: is_seadex_group,
            };
        };

        if !profile.allowed_qualities.contains(&release_quality.id) {
            return DownloadAction::Reject {
                reason: "Quality not allowed in profile".to_string(),
            };
        }

        let current_quality = current
            .quality_id
            .and_then(crate::quality::definition::get_quality_by_id)
            .unwrap_or_else(Quality::unknown);

        let current_info = EpisodeQualityInfo {
            quality: current_quality.clone(),
            is_seadex: current.is_seadex,
        };

        let decision =
            profile.should_download(&release_quality, is_seadex_group, Some(&current_info));

        match decision {
            crate::quality::DownloadDecision::Accept => DownloadAction::Accept {
                quality: release_quality,
                is_seadex: is_seadex_group,
            },
            crate::quality::DownloadDecision::Upgrade(reason) => DownloadAction::Upgrade {
                quality: release_quality,
                is_seadex: is_seadex_group,
                reason: reason.to_string(),
                old_file_path: current.file_path.clone(),
                old_quality: current_quality,
            },
            crate::quality::DownloadDecision::Reject(reason) => DownloadAction::Reject {
                reason: reason.to_string(),
            },
        }
    }

    pub async fn get_quality_profile_for_anime(&self, anime_id: i32) -> Result<QualityProfile> {
        let profile_id = if let Some(anime) = self.store.get_anime(anime_id).await? {
            anime.quality_profile_id.unwrap_or(1)
        } else {
            1
        };

        let profile_row = self.store.get_quality_profile(profile_id).await?;
        let allowed_qualities = self.store.get_profile_allowed_qualities(profile_id).await?;

        let profile = if let Some(row) = profile_row {
            let cutoff = crate::quality::definition::get_quality_by_id(row.cutoff_quality_id)
                .unwrap_or_else(|| crate::quality::definition::QUALITY_BLURAY_1080P.clone());

            QualityProfile {
                id: row.id,
                name: row.name,
                cutoff,
                upgrade_allowed: row.upgrade_allowed,
                seadex_preferred: row.seadex_preferred,
                allowed_qualities,
            }
        } else {
            QualityProfile::default_profile()
        };

        Ok(profile)
    }
}

#[derive(Debug, Clone, serde::Serialize)]
pub enum DownloadAction {
    Accept {
        quality: Quality,
        is_seadex: bool,
    },

    Upgrade {
        quality: Quality,
        is_seadex: bool,
        reason: String,
        old_file_path: Option<String>,
        old_quality: Quality,
    },

    Reject {
        reason: String,
    },
}

impl DownloadAction {
    pub fn should_download(&self) -> bool {
        matches!(self, Self::Accept { .. } | Self::Upgrade { .. })
    }

    pub fn is_upgrade(&self) -> bool {
        matches!(self, Self::Upgrade { .. })
    }

    pub fn quality(&self) -> Option<&Quality> {
        match self {
            Self::Accept { quality, .. } | Self::Upgrade { quality, .. } => Some(quality),
            Self::Reject { .. } => None,
        }
    }

    pub fn is_seadex(&self) -> bool {
        match self {
            Self::Accept { is_seadex, .. } | Self::Upgrade { is_seadex, .. } => *is_seadex,
            Self::Reject { .. } => false,
        }
    }
}
