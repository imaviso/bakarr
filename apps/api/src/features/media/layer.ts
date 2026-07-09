import { Layer } from "effect";

import { AnimeFileServiceLive } from "@/features/media/files/media-file-service.ts";
import { AnimeImageCacheServiceLive } from "@/features/media/metadata/media-image-cache-service.ts";
import { AnimeMaintenanceServiceLive } from "@/features/media/metadata/media-maintenance-service.ts";
import { AnimeMetadataEnrichmentServiceLive } from "@/features/media/metadata/media-metadata-enrichment-service.ts";
import { AnimeMetadataProviderServiceLive } from "@/features/media/metadata/media-metadata-provider-service.ts";
import { AnimeSeasonalProviderServiceLive } from "@/features/media/query/media-seasonal-provider-service.ts";
import { MediaReaderServiceLive } from "@/features/media/reader/media-reader-service.ts";
import { AnimeSettingsServiceLive } from "@/features/media/shared/media-settings-service.ts";
import { MediaReadRepository } from "@/features/media/shared/media-read-repository.ts";
import { MediaUnitRepository } from "@/features/media/units/media-unit-repository.ts";
import { AnimeStreamServiceLive } from "@/features/media/stream/media-stream-service.ts";
import { AnimeQueryServiceLive } from "@/features/media/query/query-service.ts";
import { StreamTokenSignerLive } from "@/features/media/stream/stream-token-signer.ts";

export function makeAnimeFeatureLayer<ROut, E, RIn>(
  runtimeSupportLayer: Layer.Layer<ROut, E, RIn>,
) {
  const mediaRepositoryLayer = Layer.mergeAll(
    MediaReadRepository.Default,
    MediaUnitRepository.Default,
  ).pipe(Layer.provide(runtimeSupportLayer));
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

  const mediaServicesRuntime = Layer.mergeAll(runtimeSupportLayer, mediaRepositoryLayer);

  return Layer.mergeAll(
    animeImageCacheLayer,
    AnimeQueryServiceLive,
    AnimeFileServiceLive,
    mediaRepositoryLayer,
    MediaReaderServiceLive,
    animeMaintenanceLayer.pipe(
      Layer.provide(Layer.mergeAll(animeMetadataProviderLayer, animeImageCacheLayer)),
    ),
    animeMetadataEnrichmentLayer,
    animeMetadataProviderLayer,
    AnimeSettingsServiceLive,
    animeStreamTokenSignerLayer,
    animeStreamLayer,
  ).pipe(Layer.provideMerge(animeSeasonalProviderLayer), Layer.provide(mediaServicesRuntime));
}
