import { Layer } from "effect";

import { AnimeEnrollmentServiceLive } from "./features/anime/anime-enrollment-service.ts";
import { LibraryRootsServiceLive } from "./features/library-roots/service.ts";
import { LibraryBrowseServiceLive } from "./features/operations/library-browse-service.ts";
import { MetricsServiceLive } from "./features/system/metrics-service.ts";
import { ImageAssetServiceLive } from "./features/system/image-asset-service.ts";

export function makeAppServicesRuntimeLayer<
  PlatformOut,
  PlatformErr,
  PlatformIn,
  OperationsOut,
  OperationsErr,
  OperationsIn,
  SystemConfigOut,
  SystemConfigErr,
  SystemConfigIn,
  SystemStatusOut,
  SystemStatusErr,
  SystemStatusIn,
  AnimeOut,
  AnimeErr,
  AnimeIn,
>(
  platformLayer: Layer.Layer<PlatformOut, PlatformErr, PlatformIn>,
  operationsLayer: Layer.Layer<OperationsOut, OperationsErr, OperationsIn>,
  systemConfigLayer: Layer.Layer<SystemConfigOut, SystemConfigErr, SystemConfigIn>,
  systemStatusLayer: Layer.Layer<SystemStatusOut, SystemStatusErr, SystemStatusIn>,
  animeLayer: Layer.Layer<AnimeOut, AnimeErr, AnimeIn>,
) {
  const libraryRootsLayer = LibraryRootsServiceLive.pipe(Layer.provide(platformLayer));

  return Layer.mergeAll(
    libraryRootsLayer,
    LibraryBrowseServiceLive.pipe(
      Layer.provide(
        Layer.mergeAll(platformLayer, operationsLayer, systemConfigLayer, libraryRootsLayer),
      ),
    ),
    MetricsServiceLive.pipe(
      Layer.provide(Layer.mergeAll(platformLayer, operationsLayer, systemStatusLayer)),
    ),
    ImageAssetServiceLive.pipe(Layer.provide(Layer.mergeAll(platformLayer, systemConfigLayer))),
    AnimeEnrollmentServiceLive.pipe(
      Layer.provide(Layer.mergeAll(platformLayer, operationsLayer, animeLayer)),
    ),
  );
}
