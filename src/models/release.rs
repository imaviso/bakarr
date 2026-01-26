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
}
