import { Layer } from "effect";

import { MediaFileServiceLive } from "@/features/media/files/media-file-service.ts";
import { MediaImageCacheServiceLive } from "@/features/media/metadata/media-image-cache-service.ts";
import { MediaMaintenanceServiceLive } from "@/features/media/metadata/media-maintenance-service.ts";
import { MediaMetadataEnrichmentServiceLive } from "@/features/media/metadata/media-metadata-enrichment-service.ts";
import { MediaMetadataProviderServiceLive } from "@/features/media/metadata/media-metadata-provider-service.ts";
import { MediaSeasonalProviderServiceLive } from "@/features/media/query/media-seasonal-provider-service.ts";
import { MediaReaderServiceLive } from "@/features/media/reader/media-reader-service.ts";
import { MediaSettingsServiceLive } from "@/features/media/shared/media-settings-service.ts";
import { MediaReadRepository } from "@/features/media/shared/media-read-repository.ts";
import { MediaUnitRepository } from "@/features/media/units/media-unit-repository.ts";
import { AniDbUnitCacheRepository } from "@/features/media/units/anidb-unit-cache-repository.ts";
import { SeasonalMediaCacheRepository } from "@/features/media/query/seasonal-media-cache-repository.ts";
import { MediaStreamServiceLive } from "@/features/media/stream/media-stream-service.ts";
import { MediaQueryServiceLive } from "@/features/media/query/query-service.ts";
import { StreamTokenSignerLive } from "@/features/media/stream/stream-token-signer.ts";
import { SystemLogRepository } from "@/features/system/repository/log-repository.ts";
import { QualityProfileRepository } from "@/features/system/repository/quality-profile-repository.ts";
import { SystemConfigRepository } from "@/features/system/repository/system-config-repository.ts";

export function makeMediaFeatureLayer<ROut, E, RIn>(
  runtimeSupportLayer: Layer.Layer<ROut, E, RIn>,
) {
  const mediaRepositoryLayer = Layer.mergeAll(
    MediaReadRepository.Default,
    MediaUnitRepository.Default,
    AniDbUnitCacheRepository.Default,
    SeasonalMediaCacheRepository.Default,
    SystemLogRepository.Default,
    QualityProfileRepository.Default,
    SystemConfigRepository.Default,
  ).pipe(Layer.provide(runtimeSupportLayer));
  const animeImageCacheLayer = MediaImageCacheServiceLive;
  const animeMetadataEnrichmentLayer = MediaMetadataEnrichmentServiceLive;
  const animeMetadataProviderLayer = MediaMetadataProviderServiceLive.pipe(
    Layer.provide(animeMetadataEnrichmentLayer),
  );
  const animeMaintenanceLayer = MediaMaintenanceServiceLive.pipe(
    Layer.provide(Layer.mergeAll(animeMetadataProviderLayer, animeImageCacheLayer)),
  );
  const animeStreamTokenSignerLayer = StreamTokenSignerLive;
  const animeStreamLayer = MediaStreamServiceLive.pipe(Layer.provide(animeStreamTokenSignerLayer));
  const animeSeasonalProviderLayer = MediaSeasonalProviderServiceLive;

  const mediaServicesRuntime = Layer.mergeAll(runtimeSupportLayer, mediaRepositoryLayer);

  return Layer.mergeAll(
    animeImageCacheLayer,
    MediaQueryServiceLive,
    MediaFileServiceLive,
    mediaRepositoryLayer,
    MediaReaderServiceLive,
    animeMaintenanceLayer.pipe(
      Layer.provide(Layer.mergeAll(animeMetadataProviderLayer, animeImageCacheLayer)),
    ),
    animeMetadataEnrichmentLayer,
    animeMetadataProviderLayer,
    MediaSettingsServiceLive,
    animeStreamTokenSignerLayer,
    animeStreamLayer,
  ).pipe(Layer.provideMerge(animeSeasonalProviderLayer), Layer.provide(mediaServicesRuntime));
}
