import { Layer } from "effect";

import { MediaFileServiceLive } from "@/features/media/files/media-file-service.ts";
import { MediaImageCacheServiceLive } from "@/features/media/metadata/media-image-cache-service.ts";
import { MediaMaintenanceServiceLive } from "@/features/media/metadata/media-maintenance-service.ts";
import { MediaMetadataEnrichmentServiceLive } from "@/features/media/metadata/media-metadata-enrichment-service.ts";
import { MediaMetadataProviderServiceLive } from "@/features/media/metadata/media-metadata-provider-service.ts";
import { MediaSeasonalProviderServiceLive } from "@/features/media/query/media-seasonal-provider-service.ts";
import { MediaReaderServiceLive } from "@/features/media/reader/media-reader-service.ts";
import { MediaSettingsServiceLive } from "@/features/media/shared/media-settings-service.ts";
import { MediaStreamServiceLive } from "@/features/media/stream/media-stream-service.ts";
import { MediaQueryServiceLive } from "@/features/media/query/query-service.ts";
import { StreamTokenSignerLive } from "@/features/media/stream/stream-token-signer.ts";

export function makeMediaFeatureLayer<ROut, E, RIn, LeavesOut, LeavesE, LeavesIn>(
  runtimeSupportLayer: Layer.Layer<ROut, E, RIn>,
  pureDbLeaves: Layer.Layer<LeavesOut, LeavesE, LeavesIn>,
) {
  const mediaServicesRuntime = Layer.mergeAll(runtimeSupportLayer, pureDbLeaves);

  const mediaImageCacheLayer = MediaImageCacheServiceLive;
  const mediaMetadataEnrichmentLayer = MediaMetadataEnrichmentServiceLive;
  const mediaMetadataProviderLayer = MediaMetadataProviderServiceLive.pipe(
    Layer.provide(mediaMetadataEnrichmentLayer),
  );
  const mediaMaintenanceLayer = MediaMaintenanceServiceLive.pipe(
    Layer.provide(Layer.mergeAll(mediaMetadataProviderLayer, mediaImageCacheLayer)),
  );
  const mediaStreamTokenSignerLayer = StreamTokenSignerLive;
  const mediaStreamLayer = MediaStreamServiceLive.pipe(Layer.provide(mediaStreamTokenSignerLayer));
  const mediaSeasonalProviderLayer = MediaSeasonalProviderServiceLive;

  return Layer.mergeAll(
    mediaImageCacheLayer,
    MediaQueryServiceLive,
    MediaFileServiceLive,
    MediaReaderServiceLive,
    mediaMaintenanceLayer.pipe(
      Layer.provide(Layer.mergeAll(mediaMetadataProviderLayer, mediaImageCacheLayer)),
    ),
    mediaMetadataEnrichmentLayer,
    mediaMetadataProviderLayer,
    MediaSettingsServiceLive,
    mediaStreamTokenSignerLayer,
    mediaStreamLayer,
  ).pipe(Layer.provideMerge(mediaSeasonalProviderLayer), Layer.provide(mediaServicesRuntime));
}
