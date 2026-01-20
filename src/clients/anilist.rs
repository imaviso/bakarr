use crate::models::anime::{Anime, AnimeTitle};
use anyhow::Result;
use chrono::{DateTime, Utc};
use reqwest::Client;
use serde::{Deserialize, Serialize};

const ANILIST_API: &str = "https://graphql.anilist.co";

#[derive(Serialize)]
struct GraphQLRequest<'a> {
    query: &'a str,
    variables: Variables<'a>,
}

#[derive(Serialize)]
struct Variables<'a> {
    search: &'a str,
}

#[derive(Deserialize)]
struct GraphQLResponse {
    data: Option<Data>,
}

#[derive(Deserialize)]
struct Data {
    #[serde(rename = "Page")]
    page: Page,
}

#[derive(Deserialize)]
struct Page {
    media: Vec<Media>,
}

#[derive(Deserialize)]
struct Media {
    id: i32,
    title: Title,
    format: Option<String>,
    episodes: Option<i32>,
    status: Option<String>,
    _synonyms: Option<Vec<String>>,
    #[serde(rename = "coverImage")]
    cover_image: Option<CoverImage>,
    #[serde(rename = "bannerImage")]
    banner_image: Option<String>,
    #[serde(rename = "nextAiringEpisode")]
    next_airing_episode: Option<NextAiringEpisode>,
    description: Option<String>,
    #[serde(rename = "averageScore")]
    average_score: Option<i32>,
    genres: Option<Vec<String>>,
    studios: Option<Studios>,
    #[serde(rename = "seasonYear")]
    season_year: Option<i32>,
}

#[derive(Deserialize)]
struct Studios {
    nodes: Vec<StudioNode>,
}

#[derive(Deserialize)]
struct StudioNode {
    name: String,
    #[serde(rename = "isAnimationStudio")]
    is_animation_studio: bool,
}

#[derive(Deserialize)]
struct NextAiringEpisode {
    episode: i32,
}

#[derive(Deserialize)]
struct CoverImage {
    #[serde(rename = "extraLarge")]
    extra_large: Option<String>,
    large: Option<String>,
}

#[derive(Deserialize)]
struct Title {
    romaji: Option<String>,
    english: Option<String>,
    native: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct AnilistEpisode {
    pub title: Option<String>,
    pub thumbnail: Option<String>,
    pub url: Option<String>,
    pub site: Option<String>,
    pub aired: Option<String>,
}

#[derive(Clone)]
pub struct AnilistClient {
    client: Client,
}

impl Default for AnilistClient {
    fn default() -> Self {
        Self::new()
    }
}

impl AnilistClient {
    pub fn new() -> Self {
        Self {
            client: Client::builder()
                .user_agent("Bakarr/1.0")
                .build()
                .unwrap_or_else(|_| Client::new()),
        }
    }

    pub async fn search_anime(&self, query: &str) -> Result<Vec<Anime>> {
        let gql_query = r#"
            query ($search: String) {
                Page(page: 1, perPage: 10) {
                    media(search: $search, type: ANIME) {
                        id
                        title { romaji english native }
                        format
                        episodes
                        status
                        synonyms
                        seasonYear
                        coverImage { extraLarge large }
                        bannerImage
                        description(asHtml: false)
                        averageScore
                        genres
                        studios(isMain: true) {
                            nodes {
                                name
                                isAnimationStudio
                            }
                        }
                    }
                }
            }
        "#;

        let request_body = GraphQLRequest {
            query: gql_query,
            variables: Variables { search: query },
        };

        let response: GraphQLResponse = self
            .client
            .post(ANILIST_API)
            .json(&request_body)
            .send()
            .await?
            .json()
            .await?;

        let anime_list = response
            .data
            .map(|d| {
                d.page
                    .media
                    .into_iter()
                    .map(|m| self.map_media_to_anime(m))
                    .collect()
            })
            .unwrap_or_default();

        Ok(anime_list)
    }

    pub async fn get_by_id(&self, id: i32) -> Result<Option<Anime>> {
        let gql_query = r#"
            query ($id: Int) {
                Media(id: $id, type: ANIME) {
                    id
                    title { romaji english native }
                    format
                    episodes
                    status
                    synonyms
                    seasonYear
                    coverImage { extraLarge large }
                    bannerImage
                    nextAiringEpisode {
                        episode
                    }
                    description(asHtml: false)
                    averageScore
                    genres
                    studios(isMain: true) {
                        nodes {
                            name
                            isAnimationStudio
                        }
                    }
                }
            }
        "#;

        #[derive(Serialize)]
        struct IdVar {
            id: i32,
        }

        #[derive(Serialize)]
        struct IdRequest<'a> {
            query: &'a str,
            variables: IdVar,
        }

        #[derive(Deserialize)]
        struct IdResponse {
            data: Option<MediaWrapper>,
        }

        #[derive(Deserialize)]
        struct MediaWrapper {
            #[serde(rename = "Media")]
            media: Option<Media>,
        }

        let request_body = IdRequest {
            query: gql_query,
            variables: IdVar { id },
        };

        let response: IdResponse = self
            .client
            .post(ANILIST_API)
            .json(&request_body)
            .send()
            .await?
            .json()
            .await?;

        Ok(response
            .data
            .and_then(|d| d.media)
            .map(|m| self.map_media_to_anime(m)))
    }

    fn map_media_to_anime(&self, m: Media) -> Anime {
        let episode_count = m
            .episodes
            .or_else(|| m.next_airing_episode.map(|nae| nae.episode));

        let studios_vec = m.studios.map(|s| {
            s.nodes
                .into_iter()
                .filter(|n| n.is_animation_studio)
                .map(|n| n.name)
                .collect::<Vec<String>>()
        });

        Anime {
            id: m.id,
            title: AnimeTitle {
                romaji: m.title.romaji.unwrap_or_default(),
                english: m.title.english,
                native: m.title.native,
            },
            format: m.format.unwrap_or_else(|| "UNKNOWN".to_string()),
            episode_count,
            status: m.status.unwrap_or_else(|| "UNKNOWN".to_string()),
            quality_profile_id: None,
            cover_image: m.cover_image.and_then(|c| c.extra_large.or(c.large)),
            banner_image: m.banner_image,
            added_at: String::new(),
            profile_name: None,
            mal_id: None,
            description: m.description,
            score: m.average_score.map(|s| s as f32),
            genres: m.genres,
            studios: studios_vec,
            path: None,
            start_year: m.season_year,
            monitored: true,
        }
    }

    pub async fn get_episodes(&self, id: i32) -> Result<Vec<AnilistEpisode>> {
        let gql_query = r#"
            query ($id: Int) {
                Media(id: $id, type: ANIME) {
                    streamingEpisodes {
                        title
                        thumbnail
                        url
                        site
                    }
                    airingSchedule(perPage: 500) {
                        nodes {
                            episode
                            airingAt
                        }
                    }
                }
            }
        "#;

        #[derive(Serialize)]
        struct IdVar {
            id: i32,
        }

        #[derive(Serialize)]
        struct IdRequest<'a> {
            query: &'a str,
            variables: IdVar,
        }

        #[derive(Deserialize)]
        struct IdResponse {
            data: Option<MediaWrapper>,
        }

        #[derive(Deserialize)]
        struct MediaWrapper {
            #[serde(rename = "Media")]
            media: Option<MediaEpisodes>,
        }

        #[derive(Deserialize)]
        struct MediaEpisodes {
            #[serde(rename = "streamingEpisodes")]
            streaming_episodes: Vec<AnilistEpisode>,
            #[serde(rename = "airingSchedule")]
            airing_schedule: Option<AiringScheduleConnection>,
        }

        #[derive(Deserialize)]
        struct AiringScheduleConnection {
            nodes: Vec<AiringScheduleNode>,
        }

        #[derive(Deserialize)]
        struct AiringScheduleNode {
            episode: i32,
            #[serde(rename = "airingAt")]
            airing_at: i64,
        }

        let request_body = IdRequest {
            query: gql_query,
            variables: IdVar { id },
        };

        let response: IdResponse = self
            .client
            .post(ANILIST_API)
            .json(&request_body)
            .send()
            .await?
            .json()
            .await?;

        let media = response.data.and_then(|d| d.media);

        if let Some(media) = media {
            let mut episodes = media.streaming_episodes;
            let schedule = media.airing_schedule.map(|s| s.nodes).unwrap_or_default();

            let mut air_dates = std::collections::HashMap::new();
            for node in schedule {
                if let Some(dt) = DateTime::<Utc>::from_timestamp(node.airing_at, 0) {
                    air_dates.insert(node.episode, dt.to_rfc3339());
                }
            }

            let re = regex::Regex::new(r"(?i)^Episode\s+(\d+)").unwrap();

            for ep in &mut episodes {
                if let Some(title) = &ep.title
                    && let Some(caps) = re.captures(title)
                    && let Ok(num) = caps[1].parse::<i32>()
                    && let Some(date) = air_dates.get(&num)
                {
                    ep.aired = Some(date.clone());
                }
            }

            let existing_nums: std::collections::HashSet<i32> = episodes
                .iter()
                .filter_map(|ep| {
                    ep.title
                        .as_ref()
                        .and_then(|t| re.captures(t).and_then(|c| c[1].parse::<i32>().ok()))
                })
                .collect();

            for (ep_num, date) in air_dates {
                if !existing_nums.contains(&ep_num) {
                    episodes.push(AnilistEpisode {
                        title: Some(format!("Episode {}", ep_num)),
                        thumbnail: None,
                        url: None,
                        site: None,
                        aired: Some(date),
                    });
                }
            }

            Ok(episodes)
        } else {
            Ok(Vec::new())
        }
    }
}
