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

/// Consolidates regexes for XML parsing to avoid per-call overhead.
struct NyaaRegex {
    title: Regex,
    link: Regex,
    guid: Regex,
    pub_date: Regex,
    seeders: Regex,
    leechers: Regex,
    downloads: Regex,
    info_hash: Regex,
    size: Regex,
    trusted: Regex,
    remake: Regex,
    item: Regex,
}

impl NyaaRegex {
    fn get() -> Option<&'static Self> {
        static INSTANCE: OnceLock<Option<NyaaRegex>> = OnceLock::new();
        INSTANCE
            .get_or_init(|| {
                Some(Self {
                    title: Regex::new(r"<title>([^<]*)</title>").ok()?,
                    link: Regex::new(r"<link>([^<]*)</link>").ok()?,
                    guid: Regex::new(r"<guid>([^<]*)</guid>").ok()?,
                    pub_date: Regex::new(r"<pubDate>([^<]*)</pubDate>").ok()?,
                    seeders: Regex::new(r"<nyaa:seeders>([^<]*)</nyaa:seeders>").ok()?,
                    leechers: Regex::new(r"<nyaa:leechers>([^<]*)</nyaa:leechers>").ok()?,
                    downloads: Regex::new(r"<nyaa:downloads>([^<]*)</nyaa:downloads>").ok()?,
                    info_hash: Regex::new(r"<nyaa:infoHash>([^<]*)</nyaa:infoHash>").ok()?,
                    size: Regex::new(r"<nyaa:size>([^<]*)</nyaa:size>").ok()?,
                    trusted: Regex::new(r"<nyaa:trusted>([^<]*)</nyaa:trusted>").ok()?,
                    remake: Regex::new(r"<nyaa:remake>([^<]*)</nyaa:remake>").ok()?,
                    item: Regex::new(r"(?s)<item>(.*?)</item>").ok()?,
                })
            })
            .as_ref()
    }
}

fn extract_tag(xml: &str, re: &Regex) -> String {
    re.captures(xml)
        .and_then(|c| c.get(1))
        .map(|m| m.as_str().to_string())
        .unwrap_or_default()
}

fn parse_item(item_xml: &str) -> Option<NyaaTorrent> {
    let re = NyaaRegex::get()?;
    Some(NyaaTorrent {
        title: html_escape::decode_html_entities(&extract_tag(item_xml, &re.title)).to_string(),
        torrent_url: extract_tag(item_xml, &re.link),
        view_url: extract_tag(item_xml, &re.guid),
        pub_date: extract_tag(item_xml, &re.pub_date),
        seeders: extract_tag(item_xml, &re.seeders).parse().unwrap_or(0),
        leechers: extract_tag(item_xml, &re.leechers).parse().unwrap_or(0),
        downloads: extract_tag(item_xml, &re.downloads).parse().unwrap_or(0),
        info_hash: extract_tag(item_xml, &re.info_hash),
        size: extract_tag(item_xml, &re.size),
        trusted: extract_tag(item_xml, &re.trusted).eq_ignore_ascii_case("yes"),
        remake: extract_tag(item_xml, &re.remake).eq_ignore_ascii_case("yes"),
    })
}

fn parse_rss_items(xml: &str) -> Vec<NyaaTorrent> {
    let Some(re) = NyaaRegex::get() else {
        return Vec::new();
    };
    re.item
        .captures_iter(xml)
        .filter_map(|c| c.get(1))
        .filter_map(|m| parse_item(m.as_str()))
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

        // NYAA_RSS_BASE is a compile-time constant, so this should never fail.
        // Using unwrap_or_default as a safe fallback.
        let mut url = Url::parse(NYAA_RSS_BASE).unwrap_or_else(|_| {
            // This is a critical error - log it and return a minimal URL
            eprintln!("CRITICAL: Invalid NYAA_RSS_BASE constant: {NYAA_RSS_BASE}");
            Url::parse("https://nyaa.si").expect("Hardcoded URL should be valid")
        });
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
    /// Creates a new `NyaaClient` with a 30-second timeout.
    ///
    /// # Panics
    /// Panics if the HTTP client cannot be built (e.g., due to system TLS configuration issues).
    /// This is a programming error or critical system issue that should not be caught.
    #[must_use]
    pub fn new() -> Self {
        Self::with_timeout(std::time::Duration::from_secs(30))
            .expect("Failed to create NyaaClient with default timeout")
    }

    /// Creates a new `NyaaClient` with a custom timeout.
    ///
    /// # Errors
    /// Returns an error if the HTTP client cannot be built.
    pub fn with_timeout(timeout: std::time::Duration) -> anyhow::Result<Self> {
        let client = Client::builder()
            .timeout(timeout)
            .user_agent("Bakarr/1.0")
            .build()
            .map_err(|e| anyhow::anyhow!("Failed to build HTTP client: {e}"))?;

        Ok(Self { client })
    }

    /// Creates a new `NyaaClient` using a shared HTTP client.
    ///
    /// This is the preferred constructor when using `SharedState` as it allows
    /// connection pooling and reuse across multiple clients.
    #[must_use]
    pub const fn with_shared_client(client: Client) -> Self {
        Self { client }
    }

    pub async fn search(
        &self,
        query: &str,
        category: NyaaCategory,
        filter: NyaaFilter,
    ) -> Result<Vec<NyaaTorrent>> {
        let mut url = Url::parse(NYAA_RSS_BASE)
            .map_err(|e| anyhow::anyhow!("Failed to parse NYAA base URL: {e}"))?;
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
        assert!(url.contains("Solo+Leveling") || url.contains("Solo%20Leveling"));
        assert!(url.contains("EMBER"));
        assert!(url.contains("1080p"));
    }
}
