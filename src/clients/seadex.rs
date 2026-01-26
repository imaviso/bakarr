use anyhow::Result;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use tracing::debug;
use url::Url;

const SEADEX_API: &str = "https://releases.moe/api/collections";

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct SeaDexEntry {
    #[serde(rename = "alID")]
    pub anilist_id: i32,
    pub id: String,

    pub trs: Vec<String>,
    #[serde(default)]
    pub notes: String,
    #[serde(default)]
    pub comparison: String,
    #[serde(default)]
    pub incomplete: bool,
    #[serde(rename = "theoreticalBest", default)]
    pub theoretical_best: String,
}

#[derive(Debug, Deserialize)]
struct SeaDexResponse {
    items: Vec<SeaDexEntry>,
    #[serde(default)]
    _page: i32,
    #[serde(rename = "totalItems", default)]
    _total_items: i32,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct SeaDexRelease {
    pub id: String,
    #[serde(rename = "releaseGroup")]
    pub release_group: String,
    #[serde(rename = "dualAudio", default)]
    pub dual_audio: bool,
    #[serde(rename = "infoHash", default)]
    pub info_hash: Option<String>,
    #[serde(default)]
    pub url: String,
    #[serde(rename = "isBest", default)]
    pub is_best: bool,
    #[serde(default)]
    pub tracker: Option<String>,
    #[serde(default)]
    pub tags: Vec<String>,
}

#[derive(Debug, Deserialize)]
struct ReleaseResponse {
    items: Vec<SeaDexRelease>,
    #[serde(default)]
    _page: i32,
    #[serde(rename = "totalItems", default)]
    _total_items: i32,
}

#[derive(Clone)]
pub struct SeaDexClient {
    client: Client,
}

impl Default for SeaDexClient {
    fn default() -> Self {
        Self::new()
    }
}

impl SeaDexClient {
    #[must_use]
    pub fn new() -> Self {
        Self {
            client: Client::builder()
                .user_agent("Bakarr/1.0")
                .build()
                .unwrap_or_else(|_| Client::new()),
        }
    }

    pub async fn get_best_releases(&self, anilist_id: i32) -> Result<Option<SeaDexEntry>> {
        let base_url = format!("{SEADEX_API}/entries/records");
        let mut url = Url::parse(&base_url)?;
        let filter = format!("(alID={anilist_id})");

        url.query_pairs_mut().append_pair("filter", &filter);

        debug!("Fetching SeaDex entry for AniList ID: {}", anilist_id);

        let response: SeaDexResponse = self.client.get(url).send().await?.json().await?;

        Ok(response.items.into_iter().next())
    }

    pub async fn get_release_details(&self, tr_ids: &[String]) -> Result<Vec<SeaDexRelease>> {
        if tr_ids.is_empty() {
            return Ok(vec![]);
        }

        let filter = tr_ids
            .iter()
            .map(|id| format!("id='{id}'"))
            .collect::<Vec<_>>()
            .join("||");
        let filter = format!("({filter})");

        let base_url = format!("{SEADEX_API}/torrents/records");
        let mut url = Url::parse(&base_url)?;

        url.query_pairs_mut()
            .append_pair("filter", &filter)
            .append_pair("perPage", "100");

        debug!("Fetching SeaDex release details for {} IDs", tr_ids.len());

        let response: ReleaseResponse = self.client.get(url).send().await?.json().await?;

        Ok(response.items)
    }

    pub async fn get_best_for_anime(&self, anilist_id: i32) -> Result<Vec<SeaDexRelease>> {
        if let Some(entry) = self.get_best_releases(anilist_id).await? {
            self.get_release_details(&entry.trs).await
        } else {
            Ok(vec![])
        }
    }
}
