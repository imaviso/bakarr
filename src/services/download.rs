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
        size: Option<i64>,
    ) -> Result<DownloadAction> {
        let current_status = self
            .store
            .get_episode_status(anime_id, episode_number)
            .await?;

        let profile = self.get_quality_profile_for_anime(anime_id).await?;

        let rules = self.store.get_release_rules_for_anime(anime_id).await?;

        Ok(Self::decide_download(
            &profile,
            &rules,
            current_status.as_ref(),
            release_title,
            is_seadex_group,
            size,
        ))
    }

    #[allow(clippy::too_many_lines)]
    pub fn decide_download(
        profile: &QualityProfile,
        rules: &[crate::entities::release_profile_rules::Model],
        current_status: Option<&EpisodeStatusRow>,
        release_title: &str,
        is_seadex_group: bool,
        size: Option<i64>,
    ) -> DownloadAction {
        let release_quality = parse_quality_from_filename(release_title);
        let release_title_lower = release_title.to_lowercase();
        let release_score = Self::calculate_score(&release_title_lower, rules);

        debug!(
            release_title = %release_title,
            quality = %release_quality,
            rank = release_quality.rank,
            score = release_score,
            "Release analyzed"
        );

        if let Err(reason) = Self::check_constraints(&release_title_lower, rules) {
            return DownloadAction::Reject { reason };
        }

        if !profile.allowed_qualities.contains(&release_quality.id) {
            return DownloadAction::Reject {
                reason: "Quality not allowed in profile".to_string(),
            };
        }

        // Check size limits for initial validation
        if let Some(size) = size {
            if let Some(min) = profile.min_size
                && size < min
            {
                return DownloadAction::Reject {
                    reason: "File size too small".to_string(),
                };
            }
            if let Some(max) = profile.max_size
                && size > max
            {
                return DownloadAction::Reject {
                    reason: "File size too large".to_string(),
                };
            }
        }

        let Some(current) = current_status else {
            // Check size limits for initial download
            if let crate::quality::DownloadDecision::Reject(reason) =
                profile.should_download(&release_quality, is_seadex_group, None, size)
            {
                return DownloadAction::Reject {
                    reason: reason.to_string(),
                };
            }

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
        let current_filename_lower = current_filename.to_lowercase();
        let current_score = Self::calculate_score(&current_filename_lower, rules);

        let current_info = EpisodeQualityInfo {
            quality: current_quality.clone(),
            is_seadex: current.is_seadex,
        };

        let decision =
            profile.should_download(&release_quality, is_seadex_group, Some(&current_info), size);

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
        title_lower: &str,
        rules: &[crate::entities::release_profile_rules::Model],
    ) -> i32 {
        rules
            .iter()
            .filter(|rule| {
                rule.rule_type == "preferred" && title_lower.contains(&rule.term.to_lowercase())
            })
            .map(|rule| rule.score)
            .sum()
    }

    fn check_constraints(
        title_lower: &str,
        rules: &[crate::entities::release_profile_rules::Model],
    ) -> Result<(), String> {
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
                min_size: row.min_size,
                max_size: row.max_size,
            }
        } else {
            QualityProfile::default_profile()
        };

        Ok(profile)
    }
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::episode::EpisodeStatusRow;
    use crate::quality::QualityProfile;

    fn current_status(quality_id: i32) -> EpisodeStatusRow {
        EpisodeStatusRow {
            anime_id: 1,
            episode_number: 1,
            season: 1,
            monitored: true,
            quality_id: Some(quality_id),
            is_seadex: false,
            file_path: Some("/library/Test Show - 01.mkv".to_string()),
            file_size: Some(1024),
            downloaded_at: Some("2026-01-01T00:00:00Z".to_string()),
            resolution_width: None,
            resolution_height: None,
            video_codec: None,
            audio_codecs: None,
            duration_secs: None,
        }
    }

    #[test]
    fn decide_download_rejects_when_current_quality_is_better() {
        let profile = QualityProfile::default_profile();

        let action = DownloadDecisionService::decide_download(
            &profile,
            &[],
            Some(&current_status(3)),
            "Test.Show.S01E01.720p.WEB-DL.x264",
            false,
            None,
        );

        assert!(matches!(action, DownloadAction::Reject { .. }));
    }

    #[test]
    fn decide_download_upgrades_when_quality_improves() {
        let profile = QualityProfile::default_profile();

        let action = DownloadDecisionService::decide_download(
            &profile,
            &[],
            Some(&current_status(6)),
            "Test.Show.S01E01.1080p.BluRay.x264",
            false,
            None,
        );

        assert!(matches!(action, DownloadAction::Upgrade { .. }));
    }
}
