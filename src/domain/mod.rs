//! Domain types for anime management with strong typing.
//!
//! This module provides type-safe wrappers and domain primitives for the anime
//! management subsystem. It follows the Newtype pattern to prevent ID mixing.

pub mod events;

use serde::{Deserialize, Serialize};
use std::fmt;

/// Unique identifier for an Anime in the system.
///
/// This newtype wrapper prevents mixing Anime IDs with other entity IDs (e.g., `EpisodeId`).
/// It provides full trait coverage per C-COMMON-TRAITS and C-NEWTYPE.
///
/// # Examples
///
/// ```rust
/// use bakarr::domain::AnimeId;
///
/// let id = AnimeId::new(42);
/// assert_eq!(id.value(), 42);
/// assert_eq!(id.to_string(), "42");
/// ```
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Default)]
pub struct AnimeId(i32);

impl AnimeId {
    /// Creates a new `AnimeId` from a raw i32 value.
    ///
    /// # Panics
    ///
    /// Panics in debug mode if `id` is negative. Production code should validate
    /// before construction.
    #[must_use]
    pub const fn new(id: i32) -> Self {
        debug_assert!(id >= 0, "AnimeId should be non-negative");
        Self(id)
    }

    /// Returns the underlying i32 value.
    #[must_use]
    pub const fn value(&self) -> i32 {
        self.0
    }
}

impl fmt::Display for AnimeId {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.0)
    }
}

impl From<AnimeId> for i32 {
    fn from(id: AnimeId) -> Self {
        id.0
    }
}

impl From<i32> for AnimeId {
    fn from(id: i32) -> Self {
        Self::new(id)
    }
}

impl Serialize for AnimeId {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_i32(self.0)
    }
}

impl<'de> Deserialize<'de> for AnimeId {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        let id = i32::deserialize(deserializer)?;
        Ok(Self::new(id))
    }
}

/// Sort order enumeration to replace boolean blindness.
///
/// Per C-CUSTOM-TYPE: Use enums instead of bool for clarity.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum SortOrder {
    #[default]
    Ascending,
    Descending,
}

impl SortOrder {
    /// Returns true if this is ascending order.
    #[must_use]
    pub const fn is_ascending(&self) -> bool {
        matches!(self, Self::Ascending)
    }
}

/// Episode number wrapper for type safety.
///
/// Anime episodes can be fractional (e.g., 12.5 for OVAs), hence f32.
#[derive(Debug, Clone, Copy, PartialEq, PartialOrd)]
pub struct EpisodeNumber(f32);

impl EpisodeNumber {
    /// Creates a new `EpisodeNumber`.
    ///
    /// # Panics
    ///
    /// Panics in debug mode if the number is negative.
    #[must_use]
    pub const fn new(num: f32) -> Self {
        debug_assert!(num >= 0.0, "EpisodeNumber should be non-negative");
        Self(num)
    }

    /// Returns the underlying f32 value.
    #[must_use]
    pub const fn value(&self) -> f32 {
        self.0
    }

    /// Returns true if this is a main episode (whole number).
    #[must_use]
    pub fn is_main_episode(&self) -> bool {
        self.0.fract() == 0.0
    }

    /// Returns the episode number as `i32` if it's a whole number.
    ///
    /// # Safety
    ///
    /// This cast is safe for typical episode numbers (1-1000 range).
    /// Episode numbers exceeding `i32::MAX` would be truncated, which is
    /// acceptable for this domain (anime episodes never reach that magnitude).
    #[must_use]
    #[allow(clippy::cast_possible_truncation)]
    pub fn as_i32(&self) -> Option<i32> {
        if self.is_main_episode() {
            Some(self.0 as i32)
        } else {
            None
        }
    }
}

impl fmt::Display for EpisodeNumber {
    #[allow(clippy::cast_possible_truncation)]
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        if self.is_main_episode() {
            write!(f, "{}", self.0 as i32)
        } else {
            write!(f, "{:.1}", self.0)
        }
    }
}

impl From<f32> for EpisodeNumber {
    fn from(num: f32) -> Self {
        Self::new(num)
    }
}

impl From<i32> for EpisodeNumber {
    /// Creates an `EpisodeNumber` from an `i32`.
    ///
    /// # Precision
    ///
    /// `i32` values up to 2^24 (16,777,216) can be represented exactly in `f32`.
    /// Episode numbers in anime are typically < 1000, so precision loss is not a concern.
    #[allow(clippy::cast_precision_loss)]
    fn from(num: i32) -> Self {
        Self::new(num as f32)
    }
}

impl Serialize for EpisodeNumber {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_f32(self.0)
    }
}

impl<'de> Deserialize<'de> for EpisodeNumber {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        let num = f32::deserialize(deserializer)?;
        Ok(Self::new(num))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn anime_id_conversions() {
        let id = AnimeId::new(42);
        assert_eq!(id.value(), 42);
        assert_eq!(id.to_string(), "42");
        assert_eq!(i32::from(id), 42);
        assert_eq!(AnimeId::from(42), id);
    }

    #[test]
    fn anime_id_equality() {
        let id1 = AnimeId::new(1);
        let id2 = AnimeId::new(1);
        let id3 = AnimeId::new(2);
        assert_eq!(id1, id2);
        assert_ne!(id1, id3);
    }

    #[test]
    fn sort_order_boolean_blindness_fix() {
        let asc = SortOrder::Ascending;
        let desc = SortOrder::Descending;
        assert!(asc.is_ascending());
        assert!(!desc.is_ascending());
    }

    #[test]
    fn episode_number_main_episode_detection() {
        let main = EpisodeNumber::new(12.0);
        let special = EpisodeNumber::new(12.5);
        assert!(main.is_main_episode());
        assert!(!special.is_main_episode());
        assert_eq!(main.as_i32(), Some(12));
        assert_eq!(special.as_i32(), None);
    }

    #[test]
    fn episode_number_display() {
        assert_eq!(EpisodeNumber::new(12.0).to_string(), "12");
        assert_eq!(EpisodeNumber::new(12.5).to_string(), "12.5");
    }

    #[test]
    fn anime_id_serialization() {
        let id = AnimeId::new(42);
        let json = serde_json::to_string(&id).unwrap();
        assert_eq!(json, "42");
        let deserialized: AnimeId = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized, id);
    }
}
