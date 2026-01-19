use anyhow::Result;
use reqwest::Client;
use serde::Deserialize;

const JIKAN_API: &str = "https://api.jikan.moe/v4";

#[derive(Debug, Deserialize)]
struct JikanResponse<T> {
    data: T,
}

#[derive(Debug, Deserialize)]
pub struct MalAnime {
    pub mal_id: i32,
    pub title: String,
    pub title_english: Option<String>,
    pub title_japanese: Option<String>,
    pub episodes: Option<i32>,
    pub status: Option<String>,
    #[serde(rename = "type")]
    pub anime_type: Option<String>,
    pub score: Option<f32>,
    pub synopsis: Option<String>,
    pub rating: Option<String>,
    pub broadcast: Option<Broadcast>,
    pub genres: Option<Vec<MalGenericInfo>>,
    pub studios: Option<Vec<MalGenericInfo>>,
    pub year: Option<i32>,
    pub aired: Option<Aired>,
}

#[derive(Debug, Deserialize)]
pub struct Aired {
    pub from: Option<String>,
    pub to: Option<String>,
    pub prop: Option<AiredProp>,
}

#[derive(Debug, Deserialize)]
pub struct AiredProp {
    pub from: Option<AiredDate>,
    pub to: Option<AiredDate>,
}

#[derive(Debug, Deserialize)]
pub struct AiredDate {
    pub day: Option<i32>,
    pub month: Option<i32>,
    pub year: Option<i32>,
}

impl MalAnime {
    pub fn get_start_year(&self) -> Option<i32> {
        if let Some(year) = self.year {
            return Some(year);
        }

        self.aired
            .as_ref()
            .and_then(|a| a.prop.as_ref())
            .and_then(|p| p.from.as_ref())
            .and_then(|f| f.year)
    }
}

#[derive(Debug, Deserialize)]
pub struct MalGenericInfo {
    pub mal_id: i32,
    pub name: String,
    pub url: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct Broadcast {
    pub string: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct MalEpisode {
    pub mal_id: i32,
    pub title: Option<String>,
    pub title_japanese: Option<String>,
    pub aired: Option<String>,
    pub filler: bool,
    pub recap: bool,
}

#[derive(Clone)]
pub struct JikanClient {
    client: Client,
}

impl Default for JikanClient {
    fn default() -> Self {
        Self::new()
    }
}

impl JikanClient {
    pub fn new() -> Self {
        Self {
            client: Client::new(),
        }
    }

    pub async fn get_anime(&self, mal_id: i32) -> Result<Option<MalAnime>> {
        let url = format!("{}/anime/{}", JIKAN_API, mal_id);
        let response = self.client.get(&url).send().await?;

        if response.status() == reqwest::StatusCode::NOT_FOUND {
            return Ok(None);
        }

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(anyhow::anyhow!("Jikan API error: {} - {}", status, body));
        }

        let response: JikanResponse<MalAnime> = response.json().await?;

        Ok(Some(response.data))
    }

    pub async fn get_episodes(&self, mal_id: i32, page: u32) -> Result<Vec<MalEpisode>> {
        let url = format!("{}/anime/{}/episodes?page={}", JIKAN_API, mal_id, page);
        let response = self.client.get(&url).send().await?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(anyhow::anyhow!("Jikan API error: {} - {}", status, body));
        }

        let response: JikanResponse<Vec<MalEpisode>> = response.json().await?;

        Ok(response.data)
    }

    pub async fn search(&self, query: &str) -> Result<Vec<MalAnime>> {
        let url = format!(
            "{}/anime?q={}&limit=10",
            JIKAN_API,
            urlencoding::encode(query)
        );
        let response = self.client.get(&url).send().await?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(anyhow::anyhow!("Jikan API error: {} - {}", status, body));
        }

        let response: JikanResponse<Vec<MalAnime>> = response.json().await?;

        Ok(response.data)
    }
}
