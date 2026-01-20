use anyhow::Result;
use reqwest::Client;
use serde::Deserialize;
use url::Url;

const KITSU_API: &str = "https://kitsu.io/api/edge";

#[derive(Debug, Deserialize)]
struct KitsuResponse<T> {
    data: Vec<T>,
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
    pub fn new() -> Self {
        Self {
            client: Client::builder()
                .user_agent("Bakarr/1.0")
                .build()
                .unwrap_or_else(|_| Client::new()),
        }
    }

    pub async fn get_episodes(&self, kitsu_id: i32) -> Result<Vec<KitsuEpisode>> {
        let mut all_episodes = Vec::new();
        let mut offset = 0;
        let limit = 20;
        let base_url = format!("{}/anime/{}/episodes", KITSU_API, kitsu_id);

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
        }

        Ok(all_episodes)
    }
}
