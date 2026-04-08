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

export function makeAnimeAppLayer<ROut, E, RIn>(runtimeSupportLayer: Layer.Layer<ROut, E, RIn>) {
  const metadataEnrichmentLayer = AnimeMetadataEnrichmentServiceLive.pipe(
    Layer.provideMerge(runtimeSupportLayer),
  );
  const metadataProviderLayer = AnimeMetadataProviderServiceLive.pipe(
    Layer.provideMerge(metadataEnrichmentLayer),
    Layer.provideMerge(runtimeSupportLayer),
  );
  const streamTokenSignerLayer = StreamTokenSignerLive.pipe(
    Layer.provideMerge(runtimeSupportLayer),
  );
  const animeMaintenanceLayer = AnimeMaintenanceServiceLive.pipe(
    Layer.provideMerge(metadataProviderLayer),
    Layer.provideMerge(runtimeSupportLayer),
  );
  const animeStreamLayer = AnimeStreamServiceLive.pipe(
    Layer.provideMerge(Layer.mergeAll(runtimeSupportLayer, streamTokenSignerLayer)),
  );

  return Layer.mergeAll(
    AnimeImageCacheServiceLive,
    AnimeQueryServiceLive,
    AnimeFileServiceLive,
    animeMaintenanceLayer,
    metadataEnrichmentLayer,
    metadataProviderLayer,
    AnimeSettingsServiceLive,
    streamTokenSignerLayer,
    animeStreamLayer,
  ).pipe(Layer.provideMerge(runtimeSupportLayer));
}
