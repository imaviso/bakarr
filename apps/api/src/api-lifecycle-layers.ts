import { Layer } from "effect";

import { makeAnimeAppLayer } from "@/app-compose-anime.ts";
import { makeOperationsAppLayers } from "@/app-compose-operations.ts";
import { makeSystemAppLayer } from "@/app-compose-system.ts";
import { BackgroundWorkerControllerLive } from "@/background-controller-core.ts";
import { BackgroundTaskRunnerLive } from "@/background-task-runner.ts";
import {
  makeAppExternalClientLayer,
  type AppExternalClientLayerOptions,
} from "@/app-platform-external-clients-layer.ts";
import {
  makeAppPlatformCoreRuntimeLayer,
  type AppPlatformRuntimeOptions,
} from "@/app-platform-runtime-core.ts";
import type { AppConfigShape } from "@/config.ts";
import { AnimeEnrollmentServiceLive } from "@/features/anime/anime-enrollment-service.ts";
import { AuthBootstrapServiceLive } from "@/features/auth/bootstrap-service.ts";
import { AuthCredentialServiceLive } from "@/features/auth/credential-service.ts";
import { AuthSessionServiceLive } from "@/features/auth/session-service.ts";
import { LibraryBrowseServiceLive } from "@/features/operations/library-browse-service.ts";
import { RuntimeConfigSnapshotServiceLive } from "@/features/system/runtime-config-snapshot-service.ts";
import { SystemConfigServiceLive } from "@/features/system/system-config-service.ts";
import { DiskSpaceInspectorLive } from "@/features/system/disk-space.ts";
import { MediaProbeLive } from "@/lib/media-probe.ts";

export type ApiLifecycleOptions = AppPlatformRuntimeOptions & AppExternalClientLayerOptions;

export function makeApiLifecycleLayers(
  overrides: Partial<AppConfigShape> = {},
  options?: ApiLifecycleOptions,
) {
  const platformBaseLayer = makeAppPlatformCoreRuntimeLayer(overrides, options);
  const platformBaseWithCommandLayer = options?.commandExecutorLayer
    ? Layer.mergeAll(platformBaseLayer, options.commandExecutorLayer)
    : platformBaseLayer;

  const systemConfigLayer = SystemConfigServiceLive.pipe(
    Layer.provideMerge(platformBaseWithCommandLayer),
  );
  const runtimeConfigSnapshotLayer = RuntimeConfigSnapshotServiceLive.pipe(
    Layer.provideMerge(systemConfigLayer),
  );

  const externalClientOverridesLayer = makeAppExternalClientLayer({
    ...(options?.aniDbLayer ? { aniDbLayer: options.aniDbLayer } : {}),
    ...(options?.aniListLayer ? { aniListLayer: options.aniListLayer } : {}),
    ...(options?.qbitLayer ? { qbitLayer: options.qbitLayer } : {}),
    ...(options?.rssLayer ? { rssLayer: options.rssLayer } : {}),
    ...(options?.seadexLayer ? { seadexLayer: options.seadexLayer } : {}),
  }).pipe(
    Layer.provideMerge(Layer.mergeAll(platformBaseWithCommandLayer, runtimeConfigSnapshotLayer)),
  );

  const platformExternalLayer = Layer.mergeAll(
    platformBaseWithCommandLayer,
    externalClientOverridesLayer,
  );

  const infrastructureLayer = Layer.mergeAll(MediaProbeLive, DiskSpaceInspectorLive).pipe(
    Layer.provideMerge(platformExternalLayer),
  );
  const platformLayer = Layer.mergeAll(platformExternalLayer, infrastructureLayer);

  const runtimeSupportLayer = Layer.mergeAll(
    platformLayer,
    systemConfigLayer,
    runtimeConfigSnapshotLayer,
  );
  const withRuntimeSupport = <A, E, R>(layer: Layer.Layer<A, E, R>) =>
    layer.pipe(Layer.provideMerge(runtimeSupportLayer));

  const animeLayer = makeAnimeAppLayer(runtimeSupportLayer);
  const { catalogDownloadReadLayer, operationsLayer, operationsProgressLayer, torrentClientLayer } =
    makeOperationsAppLayers(runtimeSupportLayer);

  const appDomainSubgraphLayer = Layer.mergeAll(animeLayer, operationsLayer);

  const backgroundTaskRunnerLayer = BackgroundTaskRunnerLive.pipe(
    Layer.provideMerge(appDomainSubgraphLayer),
    Layer.provideMerge(runtimeSupportLayer),
  );
  const backgroundControllerLayer = BackgroundWorkerControllerLive.pipe(
    Layer.provideMerge(backgroundTaskRunnerLayer),
    Layer.provideMerge(runtimeSupportLayer),
  );

  const systemLayer = makeSystemAppLayer({
    backgroundControllerLayer,
    catalogDownloadReadLayer,
    runtimeSupportLayer,
  });

  const authLayer = Layer.mergeAll(
    AuthBootstrapServiceLive,
    AuthCredentialServiceLive,
    AuthSessionServiceLive,
  ).pipe(Layer.provideMerge(runtimeSupportLayer));

  const libraryLayer = withRuntimeSupport(
    LibraryBrowseServiceLive.pipe(
      Layer.provideMerge(systemLayer),
      Layer.provideMerge(operationsLayer),
    ),
  );
  const animeEnrollmentLayer = withRuntimeSupport(
    AnimeEnrollmentServiceLive.pipe(
      Layer.provideMerge(animeLayer),
      Layer.provideMerge(operationsLayer),
    ),
  );

  const runtimeWorkerSubgraphLayer = Layer.mergeAll(
    backgroundTaskRunnerLayer,
    backgroundControllerLayer,
  );
  const appFeatureSubgraphLayer = Layer.mergeAll(
    appDomainSubgraphLayer,
    runtimeWorkerSubgraphLayer,
    authLayer,
    systemLayer,
    libraryLayer,
    animeEnrollmentLayer,
  );

  const appLayer = withRuntimeSupport(appFeatureSubgraphLayer);

  return {
    appLayer,
    operationsProgressLayer,
    platformLayer,
    torrentClientLayer,
  } as const;
}

export type ApiLifecycleLayers = ReturnType<typeof makeApiLifecycleLayers>;
