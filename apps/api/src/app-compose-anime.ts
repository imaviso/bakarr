import { Layer } from "effect";

import { AnimeFileServiceLive } from "@/features/anime/anime-file-service.ts";
import { AnimeImageCacheServiceLive } from "@/features/anime/anime-image-cache-service.ts";
import { AnimeMetadataEnrichmentServiceLive } from "@/features/anime/anime-metadata-enrichment-service.ts";
import { AnimeMaintenanceServiceLive } from "@/features/anime/anime-maintenance-service.ts";
import { AnimeMetadataProviderServiceLive } from "@/features/anime/anime-metadata-provider-service.ts";
import { AnimeQueryServiceLive } from "@/features/anime/query-service.ts";
import { AnimeSettingsServiceLive } from "@/features/anime/anime-settings-service.ts";
import { AnimeStreamServiceLive } from "@/features/anime/anime-stream-service.ts";
import { StreamTokenSignerLive } from "@/features/anime/stream-token-signer.ts";
import { provideLayer } from "@/lib/layer-compose.ts";

export function makeAnimeAppLayer<RSOut, RSE, RSR>(
  runtimeSupportLayer: Layer.Layer<RSOut, RSE, RSR>,
) {
  const imageCacheLayer = AnimeImageCacheServiceLive;
  const metadataEnrichmentLayer = AnimeMetadataEnrichmentServiceLive;
  const metadataProviderLayer = provideLayer(
    AnimeMetadataProviderServiceLive,
    metadataEnrichmentLayer,
  );
  const animeMaintenanceLayer = provideLayer(
    AnimeMaintenanceServiceLive,
    Layer.mergeAll(metadataProviderLayer, imageCacheLayer),
  );
  const streamTokenSignerLayer = StreamTokenSignerLive;
  const animeStreamLayer = provideLayer(AnimeStreamServiceLive, streamTokenSignerLayer);

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
  );

  return provideLayer(animeSubgraphLayer, runtimeSupportLayer);
}
