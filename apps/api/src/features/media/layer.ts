import { Layer } from "effect";

import { MediaEnrollmentServiceLive } from "@/features/media/add/media-enrollment-service.ts";
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

/**
 * Media feature root.
 *
 * Declarative merge of self-contained `Effect.Service` Defaults: each service
 * declares its domain dependencies in its own `dependencies:` array (including
 * cross-service edges such as provider -> enrichment and maintenance ->
 * provider/image-cache), so no per-service `Layer.provide` chains live here.
 * Residual context requirements (metadata clients, AppConfig, EventBus,
 * MediaProbe + RuntimeConfigSnapshotService) are covered once by the lifecycle
 * layer's single `Layer.provide` over the merged feature graph — see
 * app/lifecycle-layers.ts.
 */
export const MediaFeatureLayer = Layer.mergeAll(
  MediaEnrollmentServiceLive,
  MediaFileServiceLive,
  MediaImageCacheServiceLive,
  MediaMaintenanceServiceLive,
  MediaMetadataEnrichmentServiceLive,
  MediaMetadataProviderServiceLive,
  MediaSeasonalProviderServiceLive,
  MediaQueryServiceLive,
  MediaReaderServiceLive,
  MediaSettingsServiceLive,
  MediaStreamServiceLive,
  StreamTokenSignerLive,
);
