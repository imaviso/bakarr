use super::definition::Quality;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QualityProfile {
    pub id: i32,

    pub name: String,

    pub cutoff: Quality,

    pub upgrade_allowed: bool,

    pub seadex_preferred: bool,

    pub allowed_qualities: Vec<i32>,

    pub min_size: Option<i64>,

    pub max_size: Option<i64>,
}

impl QualityProfile {
    #[must_use]
    pub fn default_profile() -> Self {
        use super::definition::QUALITY_BLURAY_1080P;

        Self {
            id: 1,
            name: "Default".to_string(),
            cutoff: QUALITY_BLURAY_1080P.clone(),
            upgrade_allowed: true,
            seadex_preferred: true,
            allowed_qualities: vec![1, 2, 3, 4, 5, 6, 7, 8],
            min_size: None,
            max_size: None,
        }
    }

    #[must_use]
    pub fn is_quality_allowed(&self, quality: &Quality) -> bool {
        self.allowed_qualities.contains(&quality.id)
    }

    #[must_use]
    pub fn get_quality_rank(&self, quality: &Quality) -> Option<usize> {
        self.allowed_qualities
            .iter()
            .position(|&id| id == quality.id)
    }

    #[must_use]
    pub fn should_download(
        &self,
        release_quality: &Quality,
        is_seadex: bool,
        current: Option<&EpisodeQualityInfo>,
        size: Option<i64>,
    ) -> DownloadDecision {
        if let Some(size) = size {
            if let Some(min) = self.min_size
                && size < min
            {
                return DownloadDecision::Reject(RejectReason::TooSmall);
            }
            if let Some(max) = self.max_size
                && size > max
            {
                return DownloadDecision::Reject(RejectReason::TooBig);
            }
        }

        let Some(release_rank) = self.get_quality_rank(release_quality) else {
            return DownloadDecision::Reject(RejectReason::QualityNotAllowed);
        };

        let Some(current) = current else {
            return DownloadDecision::Accept;
        };

        if !self.upgrade_allowed {
            return DownloadDecision::Reject(RejectReason::UpgradesDisabled);
        }

        let cutoff_rank = self.get_quality_rank(&self.cutoff);

        let current_rank_opt = self.get_quality_rank(&current.quality);

        let current_meets_cutoff = match (current_rank_opt, cutoff_rank) {
            (Some(curr), Some(cut)) => curr <= cut,
            (Some(_), None) | (None, _) => false,
        };

        if self.seadex_preferred && is_seadex && !current.is_seadex {
            return DownloadDecision::Upgrade(UpgradeReason::SeaDexRelease);
        }

        if current_meets_cutoff && current.is_seadex {
            if is_seadex {
                match current_rank_opt {
                    Some(curr) => {
                        if release_rank < curr {
                            return DownloadDecision::Upgrade(UpgradeReason::BetterQuality);
                        }
                    }
                    None => {
                        return DownloadDecision::Upgrade(UpgradeReason::BetterQuality);
                    }
                }
            }
            return DownloadDecision::Reject(RejectReason::AlreadyAtCutoff);
        }

        if current_meets_cutoff {
            if self.seadex_preferred && is_seadex {
                return DownloadDecision::Upgrade(UpgradeReason::SeaDexRelease);
            }

            return DownloadDecision::Reject(RejectReason::AlreadyAtCutoff);
        }

        match current_rank_opt {
            Some(curr) => {
                if release_rank < curr {
                    return DownloadDecision::Upgrade(UpgradeReason::BetterQuality);
                }
            }
            None => {
                return DownloadDecision::Upgrade(UpgradeReason::BetterQuality);
            }
        }

        DownloadDecision::Reject(RejectReason::NoImprovement)
    }
}

#[derive(Debug, Clone)]
pub struct EpisodeQualityInfo {
    pub quality: Quality,
    pub is_seadex: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum DownloadDecision {
    Accept,

    Upgrade(UpgradeReason),

    Reject(RejectReason),
}

impl DownloadDecision {
    #[must_use]
    pub const fn should_download(&self) -> bool {
        matches!(self, Self::Accept | Self::Upgrade(_))
    }

    #[must_use]
    pub const fn is_upgrade(&self) -> bool {
        matches!(self, Self::Upgrade(_))
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum UpgradeReason {
    BetterQuality,
    SeaDexRelease,
}

impl std::fmt::Display for UpgradeReason {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::BetterQuality => write!(f, "better quality available"),
            Self::SeaDexRelease => write!(f, "SeaDex release available"),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RejectReason {
    QualityNotAllowed,
    UpgradesDisabled,
    AlreadyAtCutoff,
    NoImprovement,
    AlreadyDownloaded,
    TooSmall,
    TooBig,
}

impl std::fmt::Display for RejectReason {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::QualityNotAllowed => write!(f, "quality not allowed in profile"),
            Self::UpgradesDisabled => write!(f, "upgrades disabled"),
            Self::AlreadyAtCutoff => write!(f, "already at quality cutoff"),
            Self::NoImprovement => write!(f, "no quality improvement"),
            Self::AlreadyDownloaded => write!(f, "already downloaded"),
            Self::TooSmall => write!(f, "size too small"),
            Self::TooBig => write!(f, "size too big"),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::quality::definition::*;

    fn default_profile() -> QualityProfile {
        QualityProfile {
            id: 1,
            name: "Default".to_string(),
            cutoff: QUALITY_BLURAY_1080P.clone(),
            upgrade_allowed: true,
            seadex_preferred: true,

            allowed_qualities: vec![3, 4, 6],
            min_size: None,
            max_size: None,
        }
    }

    #[test]
    fn test_accept_new_download() {
        let profile = default_profile();
        let quality = QUALITY_WEB_DL_1080P.clone();

        let decision = profile.should_download(&quality, false, None, None);
        assert_eq!(decision, DownloadDecision::Accept);
    }

    #[test]
    fn test_upgrade_better_quality_by_order() {
        let profile = default_profile();

        let new_quality = QUALITY_BLURAY_1080P.clone();
        let current = EpisodeQualityInfo {
            quality: QUALITY_WEB_DL_1080P.clone(),
            is_seadex: false,
        };

        let decision = profile.should_download(&new_quality, false, Some(&current), None);
        assert_eq!(
            decision,
            DownloadDecision::Upgrade(UpgradeReason::BetterQuality)
        );
    }

    #[test]
    fn test_reject_worse_quality_by_order() {
        let profile = default_profile();

        let new_quality = QUALITY_WEB_DL_1080P.clone();
        let current = EpisodeQualityInfo {
            quality: QUALITY_BLURAY_1080P.clone(),
            is_seadex: false,
        };

        let decision = profile.should_download(&new_quality, false, Some(&current), None);

        assert_eq!(
            decision,
            DownloadDecision::Reject(RejectReason::AlreadyAtCutoff)
        );
    }

    #[test]
    fn test_upgrade_seadex() {
        let profile = default_profile();
        let quality = QUALITY_WEB_DL_1080P.clone();
        let current = EpisodeQualityInfo {
            quality: QUALITY_WEB_DL_1080P.clone(),
            is_seadex: false,
        };

        let decision = profile.should_download(&quality, true, Some(&current), None);
        assert_eq!(
            decision,
            DownloadDecision::Upgrade(UpgradeReason::SeaDexRelease)
        );
    }

    #[test]
    fn test_reject_at_cutoff() {
        let profile = default_profile();

        let quality = QUALITY_WEB_DL_1080P.clone();
        let current = EpisodeQualityInfo {
            quality: QUALITY_BLURAY_1080P.clone(),
            is_seadex: true,
        };

        let decision = profile.should_download(&quality, false, Some(&current), None);
        assert_eq!(
            decision,
            DownloadDecision::Reject(RejectReason::AlreadyAtCutoff)
        );
    }

    #[test]
    fn test_reject_quality_not_allowed() {
        let mut profile = default_profile();
        profile.allowed_qualities = vec![3];

        let quality = QUALITY_WEB_DL_1080P.clone();
        let decision = profile.should_download(&quality, false, None, None);

        assert_eq!(
            decision,
            DownloadDecision::Reject(RejectReason::QualityNotAllowed)
        );
    }

    #[test]
    fn test_no_improvement() {
        let profile = default_profile();
        let quality = QUALITY_WEB_DL_720P.clone();
        let current = EpisodeQualityInfo {
            quality: QUALITY_WEB_DL_1080P.clone(),
            is_seadex: false,
        };

        let decision = profile.should_download(&quality, false, Some(&current), None);
        assert_eq!(
            decision,
            DownloadDecision::Reject(RejectReason::NoImprovement)
        );
    }
}
