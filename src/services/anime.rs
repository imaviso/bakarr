use std::sync::Arc;

use crate::clients::jikan::JikanClient;
use crate::clients::kitsu::KitsuClient;
use crate::clients::offline_db::OfflineDatabase;
use crate::models::anime::Anime;
use crate::services::provenance::{AnimeProvenance, MetadataProvider};

pub struct AnimeMetadataService {
    offline_db: Arc<OfflineDatabase>,
    kitsu: Arc<KitsuClient>,
}

impl AnimeMetadataService {
    #[must_use]
    pub const fn new(offline_db: Arc<OfflineDatabase>, kitsu: Arc<KitsuClient>) -> Self {
        Self { offline_db, kitsu }
    }

    /// Enriches anime metadata from external providers and tracks provenance.
    ///
    /// Returns a tuple of (`was_modified`, `provenance_json)`:
    /// - `was_modified`: true if any metadata fields were populated
    /// - `provenance_json`: JSON string tracking which provider filled which field, or None
    pub async fn enrich_anime_metadata(&self, anime: &mut Anime) -> (bool, Option<String>) {
        let mut provenance = AnimeProvenance::new();
        let mut was_modified = false;

        // Track which fields are populated so we know what to fill from Kitsu
        let mut has_description = anime.description.is_some();
        let mut has_score = anime.score.is_some();

        // First try Jikan (MAL) for rich metadata
        if let Ok(Some(mal_id)) = self.offline_db.anilist_to_mal(anime.id).await {
            anime.mal_id = Some(mal_id);
            let jikan_client = JikanClient::new();
            match jikan_client.get_anime(mal_id).await {
                Ok(Some(mal_anime)) => {
                    if anime.description.is_none() && mal_anime.synopsis.is_some() {
                        anime.description = mal_anime.synopsis;
                        has_description = true;
                        provenance.record_description(MetadataProvider::Jikan);
                        was_modified = true;
                    }

                    if anime.score.is_none() && mal_anime.score.is_some() {
                        // Normalize Jikan score (0-10) to 0-100 scale
                        anime.score = mal_anime.score.map(|s| s * 10.0);
                        has_score = true;
                        provenance.record_score(MetadataProvider::Jikan);
                        was_modified = true;
                    }

                    if let Some(genres) = mal_anime.genres {
                        let genre_names: Vec<String> = genres.into_iter().map(|g| g.name).collect();
                        anime.genres = Some(genre_names);
                        provenance.record_genres(MetadataProvider::Jikan);
                        was_modified = true;
                    }

                    if let Some(studios) = mal_anime.studios {
                        let studio_names: Vec<String> =
                            studios.into_iter().map(|s| s.name).collect();
                        anime.studios = Some(studio_names);
                        provenance.record_studios(MetadataProvider::Jikan);
                        was_modified = true;
                    }
                }
                Ok(None) => tracing::warn!(mal_id, "Details not found on Jikan"),
                Err(e) => tracing::warn!(error = %e, "Failed to fetch details from Jikan"),
            }
        }

        // If we're missing description or score, try Kitsu as a fallback
        if !has_description || !has_score {
            let kitsu_modified = self.try_enrich_from_kitsu(anime, &mut provenance).await;
            was_modified = was_modified || kitsu_modified;
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
                // Fill missing fields
                if anime.description.is_none() && kitsu_data.description.is_some() {
                    anime.description = kitsu_data.description;
                    provenance.record_description(MetadataProvider::Kitsu);
                    was_modified = true;
                    tracing::debug!(anime_id = anime.id, "Filled description from Kitsu");
                }

                if anime.score.is_none() && kitsu_data.score.is_some() {
                    anime.score = kitsu_data.score;
                    provenance.record_score(MetadataProvider::Kitsu);
                    was_modified = true;
                    tracing::debug!(anime_id = anime.id, "Filled score from Kitsu");
                }
            }
            Ok(None) => tracing::debug!(kitsu_id, "Anime not found on Kitsu"),
            Err(e) => tracing::warn!(error = %e, "Failed to fetch details from Kitsu"),
        }

        was_modified
    }
}
