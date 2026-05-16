import { Layer } from "effect";

import { AnimeFileServiceLive } from "@/features/anime/files/anime-file-service.ts";
import { AnimeImageCacheServiceLive } from "@/features/anime/metadata/anime-image-cache-service.ts";
import { AnimeMaintenanceServiceLive } from "@/features/anime/metadata/anime-maintenance-service.ts";
import { AnimeMetadataEnrichmentServiceLive } from "@/features/anime/metadata/anime-metadata-enrichment-service.ts";
import { AnimeMetadataProviderServiceLive } from "@/features/anime/metadata/anime-metadata-provider-service.ts";
import { AnimeSeasonalProviderServiceLive } from "@/features/anime/query/anime-seasonal-provider-service.ts";
import { AnimeSettingsServiceLive } from "@/features/anime/shared/anime-settings-service.ts";
import { AnimeStreamServiceLive } from "@/features/anime/stream/anime-stream-service.ts";
import { AnimeQueryServiceLive } from "@/features/anime/query/query-service.ts";
import { StreamTokenSignerLive } from "@/features/anime/stream/stream-token-signer.ts";

export function makeAnimeFeatureLayer<ROut, E, RIn>(
  runtimeSupportLayer: Layer.Layer<ROut, E, RIn>,
) {
  const animeImageCacheLayer = AnimeImageCacheServiceLive;
  const animeMetadataEnrichmentLayer = AnimeMetadataEnrichmentServiceLive;
  const animeMetadataProviderLayer = AnimeMetadataProviderServiceLive.pipe(
    Layer.provide(animeMetadataEnrichmentLayer),
  );
  const animeMaintenanceLayer = AnimeMaintenanceServiceLive.pipe(
    Layer.provide(Layer.mergeAll(animeMetadataProviderLayer, animeImageCacheLayer)),
  );
  const animeStreamTokenSignerLayer = StreamTokenSignerLive;
  const animeStreamLayer = AnimeStreamServiceLive.pipe(Layer.provide(animeStreamTokenSignerLayer));
  const animeSeasonalProviderLayer = AnimeSeasonalProviderServiceLive;

  return Layer.mergeAll(
    animeImageCacheLayer,
    AnimeQueryServiceLive,
    AnimeFileServiceLive,
    animeMaintenanceLayer,
    animeMetadataEnrichmentLayer,
    animeMetadataProviderLayer,
    AnimeSettingsServiceLive,
    animeStreamTokenSignerLayer,
    animeStreamLayer,
  ).pipe(Layer.provideMerge(animeSeasonalProviderLayer), Layer.provide(runtimeSupportLayer));
}
