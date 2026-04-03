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
  const externalClientOverridesLayer = makeAppExternalClientLayer({
    aniListLayer: options?.aniListLayer,
    qbitLayer: options?.qbitLayer,
    rssLayer: options?.rssLayer,
    seadexLayer: options?.seadexLayer,
  }).pipe(Layer.provideMerge(platformBaseLayer));
  const commandLayer = options?.commandExecutorLayer;

  const platformExternalLayer = commandLayer
    ? Layer.mergeAll(platformBaseLayer, commandLayer, externalClientOverridesLayer)
    : Layer.mergeAll(platformBaseLayer, externalClientOverridesLayer);

  const infrastructureLayer = Layer.mergeAll(MediaProbeLive, DiskSpaceInspectorLive).pipe(
    Layer.provideMerge(platformExternalLayer),
  );
  const platformLayer = Layer.mergeAll(platformExternalLayer, infrastructureLayer);

  const systemConfigLayer = SystemConfigServiceLive.pipe(Layer.provideMerge(platformLayer));
  const runtimeConfigSnapshotLayer = RuntimeConfigSnapshotServiceLive.pipe(
    Layer.provideMerge(systemConfigLayer),
  );

  const runtimeSupportLayer = Layer.mergeAll(
    platformLayer,
    systemConfigLayer,
    runtimeConfigSnapshotLayer,
  );

  const animeLayer = makeAnimeAppLayer(runtimeSupportLayer);
  const { catalogDownloadReadLayer, operationsLayer, operationsProgressLayer, torrentClientLayer } =
    makeOperationsAppLayers(runtimeSupportLayer);

  const appDomainSubgraphLayer = Layer.mergeAll(animeLayer, operationsLayer);

  const backgroundTaskRunnerLayer = BackgroundTaskRunnerLive.pipe(
    Layer.provideMerge(Layer.mergeAll(runtimeSupportLayer, appDomainSubgraphLayer)),
  );
  const backgroundControllerLayer = BackgroundWorkerControllerLive.pipe(
    Layer.provideMerge(Layer.mergeAll(runtimeSupportLayer, backgroundTaskRunnerLayer)),
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

  const libraryLayer = LibraryBrowseServiceLive.pipe(
    Layer.provideMerge(Layer.mergeAll(runtimeSupportLayer, operationsLayer, systemLayer)),
  );
  const animeEnrollmentLayer = AnimeEnrollmentServiceLive.pipe(
    Layer.provideMerge(Layer.mergeAll(runtimeSupportLayer, operationsLayer, animeLayer)),
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

  const appLayer = appFeatureSubgraphLayer.pipe(Layer.provideMerge(runtimeSupportLayer));

  return {
    appLayer,
    operationsProgressLayer,
    platformLayer,
    torrentClientLayer,
  } as const;
}

export type ApiLifecycleLayers = ReturnType<typeof makeApiLifecycleLayers>;
