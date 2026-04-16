import { Layer } from "effect";

import { AnimeFileServiceLive } from "@/features/anime/anime-file-service.ts";
import { AnimeImageCacheServiceLive } from "@/features/anime/anime-image-cache-service.ts";
import { AnimeMetadataEnrichmentServiceLive } from "@/features/anime/anime-metadata-enrichment-service.ts";
import { AnimeMaintenanceServiceLive } from "@/features/anime/anime-maintenance-service.ts";
import { AnimeMetadataProviderServiceLive } from "@/features/anime/anime-metadata-provider-service.ts";
import { AnimeSeasonalProviderServiceLive } from "@/features/anime/anime-seasonal-provider-service.ts";
import { AnimeQueryServiceLive } from "@/features/anime/query-service.ts";
import { AnimeSettingsServiceLive } from "@/features/anime/anime-settings-service.ts";
import { AnimeStreamServiceLive } from "@/features/anime/anime-stream-service.ts";
import { StreamTokenSignerLive } from "@/features/anime/stream-token-signer.ts";

export function makeAnimeAppLayer() {
  const imageCacheLayer = AnimeImageCacheServiceLive;
  const metadataEnrichmentLayer = AnimeMetadataEnrichmentServiceLive;
  const metadataProviderLayer = AnimeMetadataProviderServiceLive.pipe(
    Layer.provide(metadataEnrichmentLayer),
  );
  const animeMaintenanceLayer = AnimeMaintenanceServiceLive.pipe(
    Layer.provide(Layer.mergeAll(metadataProviderLayer, imageCacheLayer)),
  );
  const streamTokenSignerLayer = StreamTokenSignerLive;
  const animeStreamLayer = AnimeStreamServiceLive.pipe(Layer.provide(streamTokenSignerLayer));
  const seasonalProviderLayer = AnimeSeasonalProviderServiceLive;

  const animeSubgraphLayer = Layer.mergeAll(
    imageCacheLayer,
    AnimeQueryServiceLive,
    AnimeFileServiceLive,
    animeMaintenanceLayer,
    metadataEnrichmentLayer,
    metadataProviderLayer,
    AnimeSettingsServiceLive,
    streamTokenSignerLayer,
    animeStreamLayer,
  ).pipe(Layer.provideMerge(seasonalProviderLayer));

  return animeSubgraphLayer;
}
