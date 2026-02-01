use std::sync::Arc;

use crate::clients::jikan::JikanClient;
use crate::clients::kitsu::KitsuClient;
use crate::clients::offline_db::OfflineDatabase;
use crate::models::anime::Anime;
use crate::services::provenance::{AnimeProvenance, MetadataProvider};

pub struct AnimeMetadataService {
    offline_db: Arc<OfflineDatabase>,
    kitsu: Arc<KitsuClient>,
    jikan: Arc<JikanClient>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct JikanNeeds(u8);

impl JikanNeeds {
    const DESCRIPTION: u8 = 1;
    const SCORE: u8 = 2;
    const GENRES: u8 = 4;
    const STUDIOS: u8 = 8;

    const fn empty() -> Self {
        Self(0)
    }

    const fn insert(mut self, flag: u8) -> Self {
        self.0 |= flag;
        self
    }

    const fn contains(self, flag: u8) -> bool {
        (self.0 & flag) != 0
    }

    const fn any(self) -> bool {
        self.0 != 0
    }
}

impl AnimeMetadataService {
    #[must_use]
    pub const fn new(
        offline_db: Arc<OfflineDatabase>,
        kitsu: Arc<KitsuClient>,
        jikan: Arc<JikanClient>,
    ) -> Self {
        Self {
            offline_db,
            kitsu,
            jikan,
        }
    }

    /// Enriches anime metadata from external providers and tracks provenance.
    ///
    /// Follows the priority: `AniList` (already populated) -> Kitsu -> Jikan
    /// Never overwrites fields that already have values.
    /// Uses `offline_db` only for ID mapping, not for content.
    ///
    /// Returns a tuple of (`was_modified`, `provenance_json)`:
    /// - `was_modified`: true if any metadata fields were populated
    /// - `provenance_json`: JSON string tracking which provider filled which field, or None
    pub async fn enrich_anime_metadata(&self, anime: &mut Anime) -> (bool, Option<String>) {
        // Initialize provenance from existing data if available
        let mut provenance = anime
            .metadata_provenance
            .as_ref()
            .map(|json| AnimeProvenance::from_json(json))
            .unwrap_or_default();
        let mut was_modified = false;

        // Record AniList as the source for fields that are already populated
        // (AniList is the primary provider that populates these initially)
        if anime.description.is_some() && provenance.description.is_none() {
            provenance.record_description(MetadataProvider::Anilist);
        }
        if anime.score.is_some() && provenance.score.is_none() {
            provenance.record_score(MetadataProvider::Anilist);
        }
        if anime
            .genres
            .as_ref()
            .is_some_and(|genres| !genres.is_empty())
            && provenance.genres.is_none()
        {
            provenance.record_genres(MetadataProvider::Anilist);
        }
        if anime
            .studios
            .as_ref()
            .is_some_and(|studios| !studios.is_empty())
            && provenance.studios.is_none()
        {
            provenance.record_studios(MetadataProvider::Anilist);
        }
        if anime.cover_image.is_some() && provenance.cover_image.is_none() {
            provenance.record_cover_image(MetadataProvider::Anilist);
        }
        if anime.banner_image.is_some() && provenance.banner_image.is_none() {
            provenance.record_banner_image(MetadataProvider::Anilist);
        }

        // Track which fields are still missing
        let needs_description = anime.description.is_none();
        let needs_score = anime.score.is_none();
        let needs_cover = anime.cover_image.is_none();
        let needs_banner = anime.banner_image.is_none();

        // Use offline_db only for ID mapping (not content)
        if anime.mal_id.is_none()
            && let Ok(Some(mal_id)) = self.offline_db.anilist_to_mal(anime.id).await
        {
            anime.mal_id = Some(mal_id);
        }

        // If we have missing fields, try Kitsu first (fallback #1)
        // Kitsu only provides description/score/images.
        let needs_kitsu = needs_description || needs_score || needs_cover || needs_banner;

        if needs_kitsu {
            let kitsu_modified = self.try_enrich_from_kitsu(anime, &mut provenance).await;
            was_modified = was_modified || kitsu_modified;
        }

        // After Kitsu, check what's still missing and try Jikan (fallback #2)
        let still_needs_description = anime.description.is_none();
        let still_needs_score = anime.score.is_none();
        let still_needs_genres = anime.genres.as_ref().is_none_or(Vec::is_empty);
        let still_needs_studios = anime.studios.as_ref().is_none_or(Vec::is_empty);

        let mut jikan_needs = JikanNeeds::empty();
        if still_needs_description {
            jikan_needs = jikan_needs.insert(JikanNeeds::DESCRIPTION);
        }
        if still_needs_score {
            jikan_needs = jikan_needs.insert(JikanNeeds::SCORE);
        }
        if still_needs_genres {
            jikan_needs = jikan_needs.insert(JikanNeeds::GENRES);
        }
        if still_needs_studios {
            jikan_needs = jikan_needs.insert(JikanNeeds::STUDIOS);
        }

        if jikan_needs.any()
            && let Some(mal_id) = anime.mal_id
        {
            let jikan_modified = self
                .try_enrich_from_jikan(anime, mal_id, &mut provenance, jikan_needs)
                .await;
            was_modified = was_modified || jikan_modified;
        }

        let provenance_json = provenance.to_json();
        (was_modified, provenance_json)
    }

    /// Attempts to fill missing metadata from Kitsu.
    ///
    /// Returns true if any fields were populated from Kitsu.
    async fn try_enrich_from_kitsu(
        &self,
        anime: &mut Anime,
        provenance: &mut AnimeProvenance,
    ) -> bool {
        let mut was_modified = false;

        // First try to get kitsu_id from offline db
        let kitsu_id = if let Ok(Some(id)) = self.offline_db.anilist_to_kitsu(anime.id).await {
            Some(id)
        } else {
            // Fall back to API lookup
            match self.kitsu.lookup_kitsu_id_by_anilist(anime.id).await {
                Ok(Some(id)) => Some(id),
                Ok(None) => {
                    tracing::debug!(anime_id = anime.id, "No Kitsu mapping found");
                    return false;
                }
                Err(e) => {
                    tracing::warn!(error = %e, "Failed to lookup Kitsu ID");
                    return false;
                }
            }
        };

        let Some(kitsu_id) = kitsu_id else {
            return false;
        };

        // Fetch anime details from Kitsu
        match self.kitsu.get_anime(kitsu_id).await {
            Ok(Some(kitsu_data)) => {
                // Fill description if missing
                if anime.description.is_none() && kitsu_data.description.is_some() {
                    anime.description = kitsu_data.description;
                    provenance.record_description(MetadataProvider::Kitsu);
                    was_modified = true;
                    tracing::debug!(anime_id = anime.id, "Filled description from Kitsu");
                }

                // Fill score if missing (Kitsu score is already 0-100 scale)
                if anime.score.is_none() && kitsu_data.score.is_some() {
                    anime.score = kitsu_data.score;
                    provenance.record_score(MetadataProvider::Kitsu);
                    was_modified = true;
                    tracing::debug!(anime_id = anime.id, "Filled score from Kitsu");
                }

                // Fill cover image if missing (Kitsu poster_image -> cover_image)
                if anime.cover_image.is_none() && kitsu_data.poster_image.is_some() {
                    anime.cover_image = kitsu_data.poster_image;
                    provenance.record_cover_image(MetadataProvider::Kitsu);
                    was_modified = true;
                    tracing::debug!(anime_id = anime.id, "Filled cover image from Kitsu");
                }

                // Fill banner image if missing (Kitsu cover_image -> banner_image)
                if anime.banner_image.is_none() && kitsu_data.cover_image.is_some() {
                    anime.banner_image = kitsu_data.cover_image;
                    provenance.record_banner_image(MetadataProvider::Kitsu);
                    was_modified = true;
                    tracing::debug!(anime_id = anime.id, "Filled banner image from Kitsu");
                }
            }
            Ok(None) => tracing::debug!(kitsu_id, "Anime not found on Kitsu"),
            Err(e) => tracing::warn!(error = %e, "Failed to fetch details from Kitsu"),
        }

        was_modified
    }

    /// Attempts to fill missing metadata from Jikan (MAL).
    ///
    /// Only fills fields that are still missing after `AniList` and Kitsu.
    /// Returns true if any fields were populated from Jikan.
    async fn try_enrich_from_jikan(
        &self,
        anime: &mut Anime,
        mal_id: i32,
        provenance: &mut AnimeProvenance,
        needs: JikanNeeds,
    ) -> bool {
        let mut was_modified = false;

        match self.jikan.get_anime(mal_id).await {
            Ok(Some(mal_anime)) => {
                // Fill description if still missing
                if needs.contains(JikanNeeds::DESCRIPTION)
                    && anime.description.is_none()
                    && mal_anime.synopsis.is_some()
                {
                    anime.description = mal_anime.synopsis;
                    provenance.record_description(MetadataProvider::Jikan);
                    was_modified = true;
                    tracing::debug!(anime_id = anime.id, "Filled description from Jikan");
                }

                // Fill score if still missing (Jikan score is 0-10, convert to 0-100)
                if needs.contains(JikanNeeds::SCORE)
                    && anime.score.is_none()
                    && mal_anime.score.is_some()
                {
                    anime.score = mal_anime.score.map(|s| s * 10.0);
                    provenance.record_score(MetadataProvider::Jikan);
                    was_modified = true;
                    tracing::debug!(anime_id = anime.id, "Filled score from Jikan");
                }

                // Fill genres if still missing
                if needs.contains(JikanNeeds::GENRES)
                    && anime.genres.as_ref().is_none_or(Vec::is_empty)
                    && let Some(genres) = mal_anime.genres
                {
                    let genre_names: Vec<String> = genres.into_iter().map(|g| g.name).collect();
                    if !genre_names.is_empty() {
                        anime.genres = Some(genre_names);
                        provenance.record_genres(MetadataProvider::Jikan);
                        was_modified = true;
                        tracing::debug!(anime_id = anime.id, "Filled genres from Jikan");
                    }
                }

                // Fill studios if still missing
                if needs.contains(JikanNeeds::STUDIOS)
                    && anime.studios.as_ref().is_none_or(Vec::is_empty)
                    && let Some(studios) = mal_anime.studios
                {
                    let studio_names: Vec<String> = studios.into_iter().map(|s| s.name).collect();
                    if !studio_names.is_empty() {
                        anime.studios = Some(studio_names);
                        provenance.record_studios(MetadataProvider::Jikan);
                        was_modified = true;
                        tracing::debug!(anime_id = anime.id, "Filled studios from Jikan");
                    }
                }
            }
            Ok(None) => tracing::warn!(mal_id, "Details not found on Jikan"),
            Err(e) => tracing::warn!(error = %e, "Failed to fetch details from Jikan"),
        }

        was_modified
    }
}
