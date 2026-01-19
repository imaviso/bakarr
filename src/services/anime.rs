use std::sync::Arc;

use crate::clients::jikan::JikanClient;
use crate::clients::offline_db::OfflineDatabase;
use crate::models::anime::Anime;

pub struct AnimeMetadataService {
    offline_db: Arc<OfflineDatabase>,
}

impl AnimeMetadataService {
    pub fn new(offline_db: Arc<OfflineDatabase>) -> Self {
        Self { offline_db }
    }

    pub async fn enrich_anime_metadata(&self, anime: &mut Anime) {
        if let Some(mal_id) = self.offline_db.anilist_to_mal(anime.id) {
            anime.mal_id = Some(mal_id);
            let jikan_client = JikanClient::new();
            match jikan_client.get_anime(mal_id).await {
                Ok(Some(mal_anime)) => {
                    anime.description = mal_anime.synopsis;
                    anime.score = mal_anime.score;

                    if let Some(genres) = mal_anime.genres {
                        let genre_names: Vec<String> = genres.into_iter().map(|g| g.name).collect();
                        anime.genres = Some(genre_names);
                    }

                    if let Some(studios) = mal_anime.studios {
                        let studio_names: Vec<String> =
                            studios.into_iter().map(|s| s.name).collect();
                        anime.studios = Some(studio_names);
                    }
                }
                Ok(None) => tracing::warn!("Details not found on Jikan for MAL ID: {}", mal_id),
                Err(e) => tracing::warn!("Failed to fetch details from Jikan: {}", e),
            }
        }
    }
}
