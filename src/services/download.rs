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
    #[must_use]
    pub const fn new(store: Store) -> Self {
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

        let rules = self.store.get_enabled_release_rules().await?;

        Ok(Self::decide_download(
            &profile,
            &rules,
            current_status.as_ref(),
            release_title,
            is_seadex_group,
        ))
    }

    pub fn decide_download(
        profile: &QualityProfile,
        rules: &[crate::entities::release_profile_rules::Model],
        current_status: Option<&EpisodeStatusRow>,
        release_title: &str,
        is_seadex_group: bool,
    ) -> DownloadAction {
        let release_quality = parse_quality_from_filename(release_title);
        let release_score = Self::calculate_score(release_title, rules);

        debug!(
            "Release '{}': Quality={} Rank={} Score={}",
            release_title, release_quality, release_quality.rank, release_score
        );

        if let Err(reason) = Self::check_constraints(release_title, rules) {
            return DownloadAction::Reject { reason };
        }

        if !profile.allowed_qualities.contains(&release_quality.id) {
            return DownloadAction::Reject {
                reason: "Quality not allowed in profile".to_string(),
            };
        }

        let Some(current) = current_status else {
            return DownloadAction::Accept {
                quality: release_quality,
                is_seadex: is_seadex_group,
                score: release_score,
            };
        };

        let current_quality = current
            .quality_id
            .and_then(crate::quality::definition::get_quality_by_id)
            .unwrap_or_else(Quality::unknown);

        let current_filename = current
            .file_path
            .as_deref()
            .map(|p| {
                std::path::Path::new(p)
                    .file_name()
                    .unwrap_or_default()
                    .to_string_lossy()
            })
            .unwrap_or_default();
        let current_score = Self::calculate_score(&current_filename, rules);

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
                score: release_score,
            },
            crate::quality::DownloadDecision::Upgrade(reason) => DownloadAction::Upgrade {
                quality: release_quality,
                is_seadex: is_seadex_group,
                score: release_score,
                reason: reason.to_string(),
                old_file_path: current.file_path.clone(),
                old_quality: current_quality,
                old_score: current_score,
            },
            crate::quality::DownloadDecision::Reject(reason) => {
                if let Some(release_rank) = profile.get_quality_rank(&release_quality)
                    && let Some(current_rank) = profile.get_quality_rank(&current_quality)
                    && release_rank == current_rank
                    && release_score > current_score
                {
                    return DownloadAction::Upgrade {
                        quality: release_quality,
                        is_seadex: is_seadex_group,
                        score: release_score,
                        reason: format!("Score upgrade (+{release_score} vs +{current_score})"),
                        old_file_path: current.file_path.clone(),
                        old_quality: current_quality,
                        old_score: current_score,
                    };
                }

                DownloadAction::Reject {
                    reason: reason.to_string(),
                }
            }
        }
    }

    fn calculate_score(
        title: &str,
        rules: &[crate::entities::release_profile_rules::Model],
    ) -> i32 {
        let mut score = 0;
        let title_lower = title.to_lowercase();

        for rule in rules {
            if rule.rule_type == "preferred" && title_lower.contains(&rule.term.to_lowercase()) {
                score += rule.score;
            }
        }
        score
    }

    fn check_constraints(
        title: &str,
        rules: &[crate::entities::release_profile_rules::Model],
    ) -> Result<(), String> {
        let title_lower = title.to_lowercase();

        for rule in rules {
            let term_lower = rule.term.to_lowercase();
            match rule.rule_type.as_str() {
                "must" => {
                    if !title_lower.contains(&term_lower) {
                        return Err(format!("Missing required term: {}", rule.term));
                    }
                }
                "must_not" => {
                    if title_lower.contains(&term_lower) {
                        return Err(format!("Contains forbidden term: {}", rule.term));
                    }
                }
                _ => {}
            }
        }
        Ok(())
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
        score: i32,
    },

    Upgrade {
        quality: Quality,
        is_seadex: bool,
        score: i32,
        reason: String,
        old_file_path: Option<String>,
        old_quality: Quality,
        old_score: i32,
    },

    Reject {
        reason: String,
    },
}

impl DownloadAction {
    #[must_use]
    pub const fn should_download(&self) -> bool {
        matches!(self, Self::Accept { .. } | Self::Upgrade { .. })
    }

    #[must_use]
    pub const fn is_upgrade(&self) -> bool {
        matches!(self, Self::Upgrade { .. })
    }

    #[must_use]
    pub const fn quality(&self) -> Option<&Quality> {
        match self {
            Self::Accept { quality, .. } | Self::Upgrade { quality, .. } => Some(quality),
            Self::Reject { .. } => None,
        }
    }

    #[must_use]
    pub const fn is_seadex(&self) -> bool {
        match self {
            Self::Accept { is_seadex, .. } | Self::Upgrade { is_seadex, .. } => *is_seadex,
            Self::Reject { .. } => false,
        }
    }
}
