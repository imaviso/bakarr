use super::definition::Quality;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QualityProfile {
    pub id: i32,

    pub name: String,

    pub cutoff: Quality,

    pub upgrade_allowed: bool,

    pub seadex_preferred: bool,

    /// Ordered list of allowed quality IDs. Index 0 is most preferred.
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

    /// Returns the rank of the quality within this profile (0 is best).
    /// Returns None if quality is not allowed.
    pub fn get_quality_rank(&self, quality: &Quality) -> Option<usize> {
        self.allowed_qualities
            .iter()
            .position(|&id| id == quality.id)
    }

    pub fn should_download(
        &self,
        release_quality: &Quality,
        is_seadex: bool,
        current: Option<&EpisodeQualityInfo>,
    ) -> DownloadDecision {
        let Some(release_rank) = self.get_quality_rank(release_quality) else {
            return DownloadDecision::Reject(RejectReason::QualityNotAllowed);
        };

        let Some(current) = current else {
            return DownloadDecision::Accept;
        };

        if !self.upgrade_allowed {
            return DownloadDecision::Reject(RejectReason::UpgradesDisabled);
        }

        // Get cutoff rank. If cutoff quality is not in the list, assume it's met (safeguard).
        // Or should we assume if cutoff is not allowed, we can never meet it?
        // Logic: Cutoff defines the point where we stop upgrading.
        // If the cutoff quality is in the list, we find its index.
        // Any quality with index <= cutoff_index is considered "meeting cutoff".
        let cutoff_rank = self.get_quality_rank(&self.cutoff);

        let current_rank_opt = self.get_quality_rank(&current.quality);

        // Calculate if current meets cutoff
        let current_meets_cutoff = match (current_rank_opt, cutoff_rank) {
            (Some(curr), Some(cut)) => curr <= cut,
            (Some(_), None) => false, // Cutoff not in profile, can't meet it? Or always meet?
            (None, _) => false, // Current quality not in profile (e.g. unknown), assume not meeting cutoff
        };

        if self.seadex_preferred && is_seadex && !current.is_seadex {
            return DownloadDecision::Upgrade(UpgradeReason::SeaDexRelease);
        }

        if current_meets_cutoff && current.is_seadex {
            if is_seadex {
                // Both are seadex, check quality
                match current_rank_opt {
                    Some(curr) => {
                        if release_rank < curr {
                            return DownloadDecision::Upgrade(UpgradeReason::BetterQuality);
                        }
                    }
                    None => {
                        // Current is unknown/unwanted, release is wanted -> Upgrade
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
            // Even if we met cutoff, if we found a better quality allowed above cutoff, should we upgrade?
            // Usually cutoff means "stop upgrading".
            // Sonarr logic: Cutoff is the target. Once met, stop.
            // UNLESS it's a "Proper" or "Real" (which we don't handle yet)
            return DownloadDecision::Reject(RejectReason::AlreadyAtCutoff);
        }

        // Current doesn't meet cutoff. Check if new release is an improvement.
        match current_rank_opt {
            Some(curr) => {
                if release_rank < curr {
                    return DownloadDecision::Upgrade(UpgradeReason::BetterQuality);
                }
            }
            None => {
                // Current file has a quality not in our profile.
                // The new file IS in our profile. That's an upgrade.
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
        QualityProfile {
            id: 1,
            name: "Default".to_string(),
            cutoff: QUALITY_BLURAY_1080P.clone(),
            upgrade_allowed: true,
            seadex_preferred: true,
            // Order: BluRay 1080p (3) > WEB-DL 1080p (4) > WEB-DL 720p (6)
            allowed_qualities: vec![3, 4, 6],
        }
    }

    #[test]
    fn test_accept_new_download() {
        let profile = default_profile();
        let quality = QUALITY_WEB_DL_1080P.clone();

        let decision = profile.should_download(&quality, false, None);
        assert_eq!(decision, DownloadDecision::Accept);
    }

    #[test]
    fn test_upgrade_better_quality_by_order() {
        let profile = default_profile();
        // Profile order: BD 1080p > WEB 1080p
        let new_quality = QUALITY_BLURAY_1080P.clone();
        let current = EpisodeQualityInfo {
            quality: QUALITY_WEB_DL_1080P.clone(),
            is_seadex: false,
        };

        let decision = profile.should_download(&new_quality, false, Some(&current));
        assert_eq!(
            decision,
            DownloadDecision::Upgrade(UpgradeReason::BetterQuality)
        );
    }

    #[test]
    fn test_reject_worse_quality_by_order() {
        let profile = default_profile();
        // Profile order: BD 1080p > WEB 1080p
        let new_quality = QUALITY_WEB_DL_1080P.clone();
        let current = EpisodeQualityInfo {
            quality: QUALITY_BLURAY_1080P.clone(),
            is_seadex: false,
        };

        let decision = profile.should_download(&new_quality, false, Some(&current));
        // Current is BD (rank 0), New is WEB (rank 1).
        // Current meets cutoff (BD <= BD).
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

        let decision = profile.should_download(&quality, true, Some(&current));
        assert_eq!(
            decision,
            DownloadDecision::Upgrade(UpgradeReason::SeaDexRelease)
        );
    }

    #[test]
    fn test_reject_at_cutoff() {
        let profile = default_profile();
        // Cutoff is BD 1080p (index 0)
        let quality = QUALITY_WEB_DL_1080P.clone();
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
        profile.allowed_qualities = vec![3]; // Only BD 1080p

        let quality = QUALITY_WEB_DL_1080P.clone();
        let decision = profile.should_download(&quality, false, None);

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

        let decision = profile.should_download(&quality, false, Some(&current));
        assert_eq!(
            decision,
            DownloadDecision::Reject(RejectReason::NoImprovement)
        );
    }
}
