import { Layer } from "effect";

import {
  makeAppPlatformCoreRuntimeLayer,
  type AppPlatformRuntimeOptions,
} from "./app-platform-runtime-core.ts";
import { DiskSpaceInspectorLive } from "./features/system/disk-space.ts";
import { MediaProbeLive } from "./lib/media-probe.ts";
import { makeBackgroundFeatureLayer } from "./background-layer.ts";
import { makeAuthFeatureLayer } from "./features/auth/auth-layer.ts";
import { makeAnimeFeatureLayer } from "./features/anime/anime-layer.ts";
import { makeAnimeEnrollmentFeatureLayer } from "./features/anime/anime-enrollment-layer.ts";
import { makeLibraryFeatureLayer } from "./features/library-roots/library-layer.ts";
import { CatalogDownloadServiceLive } from "./features/operations/catalog-service-tags.ts";
import { CatalogLibraryServiceLive } from "./features/operations/catalog-library-service.ts";
import {
  DownloadProgressServiceLive,
  DownloadWorkflowLive,
  ProgressLive,
} from "./features/operations/download-service-tags.ts";
import { SearchWorkflowLive } from "./features/operations/search-service-tags.ts";
import { makeSystemFeatureLayer } from "./features/system/system-layer.ts";
import type { AppConfigShape } from "./config.ts";

function makeOperationsFeatureLayer<APlatform, EPlatform, RPlatform, AAnime, EAnime, RAnime>(
  platformLayer: Layer.Layer<APlatform, EPlatform, RPlatform>,
  animeLayer: Layer.Layer<AAnime, EAnime, RAnime>,
) {
  const providePlatform = Layer.provideMerge(platformLayer);
  const downloadWorkflowLayer = DownloadWorkflowLive.pipe(providePlatform);
  const downloadProgressLayer = DownloadProgressServiceLive.pipe(providePlatform);
  const progressLayer = ProgressLive.pipe(Layer.provideMerge(downloadWorkflowLayer));
  const downloadOperationsLayer = Layer.mergeAll(downloadWorkflowLayer, progressLayer);
  const searchOperationsLayer = Layer.mergeAll(downloadOperationsLayer, animeLayer);

  return Layer.mergeAll(
    downloadOperationsLayer,
    downloadProgressLayer,
    CatalogDownloadServiceLive.pipe(Layer.provideMerge(downloadOperationsLayer)),
    CatalogLibraryServiceLive.pipe(Layer.provideMerge(downloadOperationsLayer)),
    SearchWorkflowLive.pipe(Layer.provideMerge(searchOperationsLayer)),
  );
}

export function makeApiLifecycleLayers(
  overrides: Partial<AppConfigShape> = {},
  options?: AppPlatformRuntimeOptions,
) {
  const platformBaseLayer = makeAppPlatformCoreRuntimeLayer(overrides, options);
  const platformWithOptionalCommandLayer = options?.commandExecutorLayer
    ? Layer.mergeAll(platformBaseLayer, options.commandExecutorLayer)
    : platformBaseLayer;
  const platformLayer = Layer.mergeAll(
    platformWithOptionalCommandLayer,
    Layer.mergeAll(DiskSpaceInspectorLive, MediaProbeLive).pipe(
      Layer.provideMerge(platformWithOptionalCommandLayer),
    ),
  );
  const providePlatform = Layer.provideMerge(platformLayer);
  const animeLayer = makeAnimeFeatureLayer(platformLayer);
  const operationsLayer = makeOperationsFeatureLayer(platformLayer, animeLayer);
  const backgroundControllerLayer = makeBackgroundFeatureLayer(
    platformLayer,
    operationsLayer,
    animeLayer,
  );
  const authLayer = makeAuthFeatureLayer(platformLayer);
  const systemLayer = makeSystemFeatureLayer(
    platformLayer,
    operationsLayer,
    backgroundControllerLayer,
  );
  const libraryLayer = makeLibraryFeatureLayer(platformLayer, operationsLayer, systemLayer);
  const animeEnrollmentLayer = makeAnimeEnrollmentFeatureLayer(
    platformLayer,
    operationsLayer,
    animeLayer,
  );
  const appLayer = Layer.mergeAll(
    operationsLayer,
    animeLayer,
    backgroundControllerLayer,
    authLayer,
    systemLayer,
    libraryLayer,
    animeEnrollmentLayer,
  ).pipe(providePlatform);

  return {
    appLayer,
    platformLayer,
  } as const;
}

export type ApiLifecycleLayers = ReturnType<typeof makeApiLifecycleLayers>;
