use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Release {
    pub original_filename: String,

    pub title: String,

    pub episode_number: f32,

    pub season: Option<i32>,

    pub group: Option<String>,

    pub resolution: Option<String>,

    pub source: Option<String>,

    pub version: Option<i32>,
}

impl Release {
    #[must_use]
    pub fn effective_season(&self) -> i32 {
        self.season.unwrap_or(1)
    }

    #[must_use]
    pub fn effective_version(&self) -> i32 {
        self.version.unwrap_or(1)
    }

    #[must_use]
    pub fn is_revised(&self) -> bool {
        self.version.is_some_and(|v| v > 1)
    }

    /// Returns the episode number as an integer by truncating the fractional part.
    /// This is the default behavior for most operations (e.g., episode 6.5 becomes 6).
    /// Use this when you need to match against database episode records.
    #[must_use]
    #[allow(clippy::cast_possible_truncation)]
    pub const fn episode_number_truncated(&self) -> i32 {
        self.episode_number as i32
    }

    /// Returns the episode number as an integer by rounding to the nearest whole number.
    /// Use this when you want more intuitive handling of partial episodes
    /// (e.g., episode 6.5 becomes 7 instead of 6).
    #[must_use]
    #[allow(clippy::cast_possible_truncation)]
    pub const fn episode_number_rounded(&self) -> i32 {
        self.episode_number.round() as i32
    }

    /// Returns true if this is a partial episode (has a fractional component).
    /// Examples: 6.5, 13.5 (often used for OVAs or specials between regular episodes)
    #[must_use]
    pub fn is_partial_episode(&self) -> bool {
        self.episode_number.fract() != 0.0
    }
}
