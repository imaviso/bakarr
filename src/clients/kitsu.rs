use anyhow::Result;
use reqwest::Client;
use serde::Deserialize;
use std::time::Duration;
use tokio::time::sleep;
use tracing::debug;
use url::Url;

const KITSU_API: &str = "https://kitsu.io/api/edge";

/// Delay between paginated requests to avoid hammering the API.
const PAGE_DELAY_MS: u64 = 100;

/// Response wrapper for list endpoints (episodes, mappings).
#[derive(Debug, Deserialize)]
struct KitsuResponse<T> {
    data: Vec<T>,
}

/// Response wrapper for single item endpoints (anime).
#[derive(Debug, Deserialize)]
struct KitsuSingleResponse<T> {
    data: T,
}

/// Anime data from Kitsu.
#[derive(Debug, Deserialize)]
#[allow(dead_code)]
struct KitsuAnime {
    id: String,
    attributes: KitsuAnimeAttributes,
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
struct KitsuAnimeAttributes {
    synopsis: Option<String>,
    #[serde(rename = "averageRating")]
    average_rating: Option<String>,
    #[serde(rename = "posterImage")]
    poster_image: Option<KitsuImageSizes>,
    #[serde(rename = "coverImage")]
    cover_image: Option<KitsuImageSizes>,
    #[serde(rename = "startDate")]
    start_date: Option<String>,
    titles: KitsuTitles,
}

#[derive(Debug, Deserialize)]
struct KitsuImageSizes {
    tiny: Option<String>,
    small: Option<String>,
    medium: Option<String>,
    large: Option<String>,
    original: Option<String>,
}

#[derive(Debug, Deserialize)]
struct KitsuTitles {
    en: Option<String>,
    #[serde(rename = "en_jp")]
    en_jp: Option<String>,
    #[serde(rename = "ja_jp")]
    ja_jp: Option<String>,
}

/// Enriched anime metadata from Kitsu.
#[derive(Debug, Clone)]
pub struct KitsuAnimeData {
    pub description: Option<String>,
    /// Average rating as a percentage (0-100), or None if not available.
    pub score: Option<f32>,
    /// Best available poster image URL (original > large > medium > small > tiny).
    pub poster_image: Option<String>,
    /// Best available cover image URL (original > large > medium > small > tiny).
    pub cover_image: Option<String>,
    /// The canonical title in English or romaji.
    pub canonical_title: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct KitsuEpisode {
    pub attributes: KitsuEpisodeAttributes,
}

#[derive(Debug, Deserialize)]
pub struct KitsuEpisodeAttributes {
    #[serde(rename = "canonicalTitle")]
    pub canonical_title: Option<String>,
    #[serde(rename = "number")]
    pub number: Option<i32>,
    pub synopsis: Option<String>,
    #[serde(rename = "airdate")]
    pub airdate: Option<String>,
}

/// Mapping entry from Kitsu for external ID lookups.
#[derive(Debug, Deserialize)]
struct KitsuMapping {
    #[serde(rename = "type")]
    _type: String,
    relationships: KitsuMappingRelationships,
}

#[derive(Debug, Deserialize)]
struct KitsuMappingRelationships {
    item: KitsuRelationshipData,
}

#[derive(Debug, Deserialize)]
struct KitsuRelationshipData {
    data: Option<KitsuRelationshipItem>,
}

#[derive(Debug, Deserialize)]
struct KitsuRelationshipItem {
    #[serde(rename = "type")]
    _type: String,
    id: String,
}

#[derive(Clone)]
pub struct KitsuClient {
    client: Client,
}

impl Default for KitsuClient {
    fn default() -> Self {
        Self::new()
    }
}

impl KitsuClient {
    #[must_use]
    pub fn new() -> Self {
        Self {
            client: Client::builder()
                .user_agent("Bakarr/1.0")
                .build()
                .unwrap_or_else(|_| Client::new()),
        }
    }

    /// Creates a new `KitsuClient` with a shared HTTP client.
    ///
    /// This enables connection pooling and prevents socket exhaustion when
    /// multiple services make HTTP requests.
    #[must_use]
    pub const fn with_shared_client(client: Client) -> Self {
        Self { client }
    }

    pub async fn get_episodes(&self, kitsu_id: i32) -> Result<Vec<KitsuEpisode>> {
        let mut all_episodes = Vec::new();
        let mut offset = 0;
        let limit = 20;
        let base_url = format!("{KITSU_API}/anime/{kitsu_id}/episodes");

        loop {
            let mut url = Url::parse(&base_url)?;
            url.query_pairs_mut()
                .append_pair("page[limit]", &limit.to_string())
                .append_pair("page[offset]", &offset.to_string());

            let response: KitsuResponse<KitsuEpisode> =
                self.client.get(url).send().await?.json().await?;

            if response.data.is_empty() {
                break;
            }

            let count = response.data.len();
            all_episodes.extend(response.data);

            if count < limit {
                break;
            }

            offset += count;

            if offset > 2000 {
                break;
            }

            // Small delay between paginated requests to be polite to the API
            sleep(Duration::from_millis(PAGE_DELAY_MS)).await;
        }

        Ok(all_episodes)
    }

    /// Looks up the Kitsu ID for an `AniList` anime ID.
    ///
    /// This queries the Kitsu mappings endpoint to find the corresponding
    /// Kitsu anime entry. Returns `None` if no mapping exists.
    ///
    /// # Errors
    ///
    /// Returns an error if the HTTP request fails or the response cannot be parsed.
    pub async fn lookup_kitsu_id_by_anilist(&self, anilist_id: i32) -> Result<Option<i32>> {
        let url = format!(
            "{KITSU_API}/mappings?filter[externalSite]=anilist/anime&filter[externalId]={anilist_id}"
        );

        debug!(anilist_id, url = %url, "Looking up Kitsu ID via mappings endpoint");

        let response: KitsuResponse<KitsuMapping> =
            self.client.get(&url).send().await?.json().await?;

        // Get the first mapping result
        let Some(mapping) = response.data.into_iter().next() else {
            debug!(anilist_id, "No Kitsu mapping found for AniList ID");
            return Ok(None);
        };

        // Extract the Kitsu anime ID from the item relationship
        let Some(item) = mapping.relationships.item.data else {
            debug!(anilist_id, "Mapping exists but has no item relationship");
            return Ok(None);
        };

        // Parse the Kitsu anime ID
        match item.id.parse::<i32>() {
            Ok(kitsu_id) => {
                debug!(anilist_id, kitsu_id, "Found Kitsu ID mapping");
                Ok(Some(kitsu_id))
            }
            Err(e) => {
                debug!(anilist_id, error = %e, item_id = %item.id, "Failed to parse Kitsu ID");
                Ok(None)
            }
        }
    }

    /// Fetches anime metadata from Kitsu.
    ///
    /// Returns enriched metadata including description, score, and image URLs.
    /// Returns `None` if the anime is not found.
    ///
    /// # Errors
    ///
    /// Returns an error if the HTTP request fails or the response cannot be parsed.
    pub async fn get_anime(&self, kitsu_id: i32) -> Result<Option<KitsuAnimeData>> {
        let url = format!("{KITSU_API}/anime/{kitsu_id}");

        debug!(kitsu_id, url = %url, "Fetching anime details from Kitsu");

        let response = self.client.get(&url).send().await;

        let response = match response {
            Ok(resp) => resp,
            Err(e) if e.status().is_some_and(|s| s == 404) => {
                debug!(kitsu_id, "Anime not found on Kitsu");
                return Ok(None);
            }
            Err(e) => return Err(e.into()),
        };

        let response: KitsuSingleResponse<KitsuAnime> = response.json().await?;
        let anime = response.data;

        // Parse score from string "82.24" to f32 (percentage 0-100)
        let score = anime.attributes.average_rating.and_then(|rating| {
            rating.parse::<f32>().ok().map(|pct| pct / 10.0) // Convert percentage to 0-10 scale
        });

        // Get best available poster image
        let poster_image = anime.attributes.poster_image.and_then(|img| {
            img.original
                .or(img.large)
                .or(img.medium)
                .or(img.small)
                .or(img.tiny)
        });

        // Get best available cover image
        let cover_image = anime.attributes.cover_image.and_then(|img| {
            img.original
                .or(img.large)
                .or(img.medium)
                .or(img.small)
                .or(img.tiny)
        });

        // Get canonical title
        let canonical_title = anime
            .attributes
            .titles
            .en
            .or(anime.attributes.titles.en_jp)
            .or(anime.attributes.titles.ja_jp);

        debug!(
            kitsu_id,
            has_description = anime.attributes.synopsis.is_some(),
            score = ?score,
            has_poster = poster_image.is_some(),
            has_cover = cover_image.is_some(),
            "Fetched anime details from Kitsu"
        );

        Ok(Some(KitsuAnimeData {
            description: anime.attributes.synopsis,
            score,
            poster_image,
            cover_image,
            canonical_title,
        }))
    }
}
