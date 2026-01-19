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
}

impl QualityProfile {
    pub fn default_profile() -> Self {
        use super::definition::*;

        Self {
            id: 1,
            name: "Default".to_string(),
            cutoff: QUALITY_BLURAY_1080P.clone(),
            upgrade_allowed: true,
            seadex_preferred: true,
            allowed_qualities: vec![1, 2, 3, 4, 5, 6, 7, 8],
        }
    }

    pub fn is_quality_allowed(&self, quality: &Quality) -> bool {
        self.allowed_qualities.contains(&quality.id)
    }

    pub fn should_download(
        &self,
        release_quality: &Quality,
        is_seadex: bool,
        current: Option<&EpisodeQualityInfo>,
    ) -> DownloadDecision {
        if !self.is_quality_allowed(release_quality) {
            return DownloadDecision::Reject(RejectReason::QualityNotAllowed);
        }

        let Some(current) = current else {
            return DownloadDecision::Accept;
        };

        if !self.upgrade_allowed {
            return DownloadDecision::Reject(RejectReason::UpgradesDisabled);
        }

        if self.seadex_preferred && is_seadex && !current.is_seadex {
            return DownloadDecision::Upgrade(UpgradeReason::SeaDexRelease);
        }

        if current.quality.meets_cutoff(&self.cutoff) && current.is_seadex {
            if is_seadex && release_quality.is_better_than(&current.quality) {
                return DownloadDecision::Upgrade(UpgradeReason::BetterQuality);
            }
            return DownloadDecision::Reject(RejectReason::AlreadyAtCutoff);
        }

        if current.quality.meets_cutoff(&self.cutoff) {
            if self.seadex_preferred && is_seadex {
                return DownloadDecision::Upgrade(UpgradeReason::SeaDexRelease);
            }
            return DownloadDecision::Reject(RejectReason::AlreadyAtCutoff);
        }

        if release_quality.is_better_than(&current.quality) {
            return DownloadDecision::Upgrade(UpgradeReason::BetterQuality);
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
    pub fn should_download(&self) -> bool {
        matches!(self, Self::Accept | Self::Upgrade(_))
    }

    pub fn is_upgrade(&self) -> bool {
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
}

impl std::fmt::Display for RejectReason {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::QualityNotAllowed => write!(f, "quality not allowed in profile"),
            Self::UpgradesDisabled => write!(f, "upgrades disabled"),
            Self::AlreadyAtCutoff => write!(f, "already at quality cutoff"),
            Self::NoImprovement => write!(f, "no quality improvement"),
            Self::AlreadyDownloaded => write!(f, "already downloaded"),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::quality::definition::*;

    fn default_profile() -> QualityProfile {
        QualityProfile::default_profile()
    }

    #[test]
    fn test_accept_new_download() {
        let profile = default_profile();
        let quality = QUALITY_WEB_1080P.clone();

        let decision = profile.should_download(&quality, false, None);
        assert_eq!(decision, DownloadDecision::Accept);
    }

    #[test]
    fn test_upgrade_better_quality() {
        let profile = default_profile();
        let new_quality = QUALITY_BLURAY_1080P.clone();
        let current = EpisodeQualityInfo {
            quality: QUALITY_WEB_1080P.clone(),
            is_seadex: false,
        };

        let decision = profile.should_download(&new_quality, false, Some(&current));
        assert_eq!(
            decision,
            DownloadDecision::Upgrade(UpgradeReason::BetterQuality)
        );
    }

    #[test]
    fn test_upgrade_seadex() {
        let profile = default_profile();
        let quality = QUALITY_WEB_1080P.clone();
        let current = EpisodeQualityInfo {
            quality: QUALITY_WEB_1080P.clone(),
            is_seadex: false,
        };

        let decision = profile.should_download(&quality, true, Some(&current));
        assert_eq!(
            decision,
            DownloadDecision::Upgrade(UpgradeReason::SeaDexRelease)
        );
    }

    #[test]
    fn test_reject_at_cutoff() {
        let profile = default_profile();
        let quality = QUALITY_WEB_1080P.clone();
        let current = EpisodeQualityInfo {
            quality: QUALITY_BLURAY_1080P.clone(),
            is_seadex: true,
        };

        let decision = profile.should_download(&quality, false, Some(&current));
        assert_eq!(
            decision,
            DownloadDecision::Reject(RejectReason::AlreadyAtCutoff)
        );
    }

    #[test]
    fn test_reject_quality_not_allowed() {
        let mut profile = default_profile();
        profile.allowed_qualities = vec![3, 4];

        let quality = QUALITY_WEB_720P.clone();
        let decision = profile.should_download(&quality, false, None);

        assert_eq!(
            decision,
            DownloadDecision::Reject(RejectReason::QualityNotAllowed)
        );
    }

    #[test]
    fn test_no_improvement() {
        let profile = default_profile();
        let quality = QUALITY_WEB_720P.clone();
        let current = EpisodeQualityInfo {
            quality: QUALITY_WEB_1080P.clone(),
            is_seadex: false,
        };

        let decision = profile.should_download(&quality, false, Some(&current));
        assert_eq!(
            decision,
            DownloadDecision::Reject(RejectReason::NoImprovement)
        );
    }
}
