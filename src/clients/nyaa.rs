use anyhow::Result;
use regex::Regex;
use reqwest::Client;
use std::sync::OnceLock;
use url::Url;

const NYAA_RSS_BASE: &str = "https://nyaa.si/?page=rss";

#[derive(Debug, Clone)]
pub struct NyaaTorrent {
    pub title: String,
    pub torrent_url: String,
    pub view_url: String,
    pub pub_date: String,
    pub seeders: u32,
    pub leechers: u32,
    pub downloads: u32,
    pub info_hash: String,
    pub size: String,
    pub trusted: bool,
    pub remake: bool,
}

impl NyaaTorrent {
    #[must_use]
    pub fn magnet_link(&self) -> String {
        format!(
            "magnet:?xt=urn:btih:{}&dn={}",
            self.info_hash,
            urlencoding::encode(&self.title)
        )
    }

    #[must_use]
    pub fn content_hash(&self) -> &str {
        &self.info_hash
    }
}

fn extract_tag(xml: &str, tag: &str) -> String {
    // Maximum number of cached regexes to prevent unbounded memory growth
    const MAX_CACHE_SIZE: usize = 32;

    static CACHE: OnceLock<std::sync::Mutex<std::collections::HashMap<String, Regex>>> =
        OnceLock::new();

    let cache_lock = CACHE.get_or_init(|| std::sync::Mutex::new(std::collections::HashMap::new()));
    let mut cache = cache_lock.lock().unwrap();

    // If cache is full and tag not present, clear it to prevent unbounded growth
    if cache.len() >= MAX_CACHE_SIZE && !cache.contains_key(tag) {
        cache.clear();
    }

    let re = cache
        .entry(tag.to_string())
        .or_insert_with(|| {
            Regex::new(&format!(
                r"<{}>([^<]*)</{}>",
                regex::escape(tag),
                regex::escape(tag)
            ))
            .unwrap()
        })
        .clone();
    drop(cache);

    re.captures(xml)
        .and_then(|c| c.get(1))
        .map(|m| m.as_str().to_string())
        .unwrap_or_default()
}

fn parse_item(item_xml: &str) -> NyaaTorrent {
    NyaaTorrent {
        title: html_escape::decode_html_entities(&extract_tag(item_xml, "title")).to_string(),
        torrent_url: extract_tag(item_xml, "link"),
        view_url: extract_tag(item_xml, "guid"),
        pub_date: extract_tag(item_xml, "pubDate"),
        seeders: extract_tag(item_xml, "nyaa:seeders").parse().unwrap_or(0),
        leechers: extract_tag(item_xml, "nyaa:leechers").parse().unwrap_or(0),
        downloads: extract_tag(item_xml, "nyaa:downloads").parse().unwrap_or(0),
        info_hash: extract_tag(item_xml, "nyaa:infoHash"),
        size: extract_tag(item_xml, "nyaa:size"),
        trusted: extract_tag(item_xml, "nyaa:trusted").eq_ignore_ascii_case("yes"),
        remake: extract_tag(item_xml, "nyaa:remake").eq_ignore_ascii_case("yes"),
    }
}

fn parse_rss_items(xml: &str) -> Vec<NyaaTorrent> {
    static ITEM_RE: OnceLock<Regex> = OnceLock::new();
    let item_re = ITEM_RE.get_or_init(|| Regex::new(r"(?s)<item>(.*?)</item>").unwrap());

    item_re
        .captures_iter(xml)
        .filter_map(|c| c.get(1))
        .map(|m| parse_item(m.as_str()))
        .collect()
}

#[derive(Clone)]
pub struct NyaaClient {
    client: Client,
}

#[derive(Debug, Clone, Copy, Default)]
pub enum NyaaCategory {
    #[default]
    AnimeEnglish,
    AnimeNonEnglish,
    AnimeRaw,
    AllAnime,
}

impl NyaaCategory {
    const fn as_str(self) -> &'static str {
        match self {
            Self::AnimeEnglish => "1_2",
            Self::AnimeNonEnglish => "1_3",
            Self::AnimeRaw => "1_4",
            Self::AllAnime => "1_0",
        }
    }
}

#[derive(Debug, Clone, Copy, Default)]
pub enum NyaaFilter {
    NoFilter,
    #[default]
    NoRemakes,
    TrustedOnly,
}

impl NyaaFilter {
    const fn as_str(self) -> &'static str {
        match self {
            Self::NoFilter => "0",
            Self::NoRemakes => "1",
            Self::TrustedOnly => "2",
        }
    }
}

#[derive(Debug, Clone, Default)]
pub struct RssFeedConfig {
    pub query: String,

    pub group: Option<String>,

    pub resolution: Option<String>,

    pub category: NyaaCategory,

    pub filter: NyaaFilter,
}

impl RssFeedConfig {
    #[must_use]
    pub fn for_anime(anime_name: &str) -> Self {
        Self {
            query: anime_name.to_string(),
            ..Default::default()
        }
    }

    #[must_use]
    pub fn with_group(mut self, group: &str) -> Self {
        self.group = Some(group.to_string());
        self
    }

    #[must_use]
    pub fn with_resolution(mut self, resolution: &str) -> Self {
        self.resolution = Some(resolution.to_string());
        self
    }

    #[must_use]
    pub const fn with_category(mut self, category: NyaaCategory) -> Self {
        self.category = category;
        self
    }

    #[must_use]
    pub const fn with_filter(mut self, filter: NyaaFilter) -> Self {
        self.filter = filter;
        self
    }

    #[must_use]
    pub fn build_url(&self) -> String {
        let mut query_parts = vec![self.query.clone()];

        if let Some(ref group) = self.group {
            query_parts.push(format!("[{group}]"));
        }

        if let Some(ref resolution) = self.resolution {
            query_parts.push(resolution.clone());
        }

        let query = query_parts.join(" ");

        let mut url = Url::parse(NYAA_RSS_BASE).expect("Invalid base URL");
        url.query_pairs_mut()
            .append_pair("q", &query)
            .append_pair("c", self.category.as_str())
            .append_pair("f", self.filter.as_str());

        url.to_string()
    }
}

impl Default for NyaaClient {
    fn default() -> Self {
        Self::new()
    }
}

impl NyaaClient {
    #[must_use]
    pub fn new() -> Self {
        Self::with_timeout(std::time::Duration::from_secs(30))
    }

    #[must_use]
    pub fn with_timeout(timeout: std::time::Duration) -> Self {
        Self {
            client: Client::builder()
                .timeout(timeout)
                .user_agent("Bakarr/1.0")
                .build()
                .expect("Failed to build HTTP client"),
        }
    }

    pub async fn search(
        &self,
        query: &str,
        category: NyaaCategory,
        filter: NyaaFilter,
    ) -> Result<Vec<NyaaTorrent>> {
        let mut url = Url::parse(NYAA_RSS_BASE).expect("Invalid base URL");
        url.query_pairs_mut()
            .append_pair("q", query)
            .append_pair("c", category.as_str())
            .append_pair("f", filter.as_str());

        self.fetch_rss(url.as_str()).await
    }

    pub async fn search_anime(&self, query: &str) -> Result<Vec<NyaaTorrent>> {
        self.search(query, NyaaCategory::AnimeEnglish, NyaaFilter::NoRemakes)
            .await
    }

    pub async fn fetch_rss(&self, url: &str) -> Result<Vec<NyaaTorrent>> {
        let xml = self.client.get(url).send().await?.text().await?;
        Ok(parse_rss_items(&xml))
    }

    pub async fn fetch_rss_with_config(&self, config: &RssFeedConfig) -> Result<Vec<NyaaTorrent>> {
        let url = config.build_url();
        self.fetch_rss(&url).await
    }

    #[must_use]
    pub fn generate_rss_url(
        anime_name: &str,
        group: Option<&str>,
        resolution: Option<&str>,
    ) -> String {
        let mut config = RssFeedConfig::for_anime(anime_name);

        if let Some(g) = group {
            config = config.with_group(g);
        }

        if let Some(r) = resolution {
            config = config.with_resolution(r);
        }

        config.build_url()
    }

    #[must_use]
    pub fn generate_rss_feeds_for_anime(
        anime_name: &str,
        groups: &[String],
        resolution: Option<&str>,
    ) -> Vec<(String, String)> {
        let mut feeds = Vec::new();

        if groups.is_empty() {
            let url = Self::generate_rss_url(anime_name, None, resolution);
            let name = format!("{anime_name} - All Groups");
            feeds.push((name, url));
        } else {
            for group in groups {
                let url = Self::generate_rss_url(anime_name, Some(group), resolution);
                let name = format!("{anime_name} - {group}");
                feeds.push((name, url));
            }
        }

        feeds
    }

    pub async fn check_feed_for_new(
        &self,
        url: &str,
        last_hash: Option<&str>,
    ) -> Result<(Vec<NyaaTorrent>, Option<String>)> {
        let torrents = self.fetch_rss(url).await?;

        let new_hash = torrents.first().map(|t| t.info_hash.clone());

        let new_torrents = if let Some(prev_hash) = last_hash {
            torrents
                .into_iter()
                .take_while(|t| t.info_hash != prev_hash)
                .collect()
        } else {
            torrents
        };

        Ok((new_torrents, new_hash))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_rss_url_generation() {
        let url = NyaaClient::generate_rss_url("Frieren", Some("SubsPlease"), Some("1080p"));
        assert!(url.contains("Frieren"));
        assert!(url.contains("SubsPlease"));
        assert!(url.contains("1080p"));
    }

    #[test]
    fn test_rss_feed_config() {
        let config = RssFeedConfig::for_anime("Solo Leveling")
            .with_group("EMBER")
            .with_resolution("1080p");

        let url = config.build_url();
        // url crate uses + for spaces in query parameters
        assert!(url.contains("Solo+Leveling") || url.contains("Solo%20Leveling"));
        assert!(url.contains("EMBER"));
        assert!(url.contains("1080p"));
    }
}
