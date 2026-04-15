import { CommandExecutor } from "@effect/platform";
import { Layer } from "effect";

import { makeAnimeAppLayer } from "@/app-compose-anime.ts";
import { makeAuthAppLayer } from "@/app-compose-auth.ts";
import { makeBackgroundAppLayers } from "@/app-compose-background.ts";
import { makeOperationsAppLayers } from "@/app-compose-operations.ts";
import { makeSystemAppLayer } from "@/app-compose-system.ts";
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
import { LibraryBrowseServiceLive } from "@/features/operations/library-browse-service.ts";
import { OperationsTaskLauncherServiceLive } from "@/features/operations/operations-task-launcher-service.ts";
import { OperationsTaskServiceLive } from "@/features/operations/operations-task-service.ts";
import { RuntimeConfigSnapshotServiceLive } from "@/features/system/runtime-config-snapshot-service.ts";
import { SystemConfigServiceLive } from "@/features/system/system-config-service.ts";
import { DiskSpaceInspectorLive } from "@/features/system/disk-space.ts";
import { MediaProbeLive } from "@/lib/media-probe.ts";

export type ApiLifecycleOptions = AppPlatformRuntimeOptions &
  AppExternalClientLayerOptions & {
    readonly commandExecutorLayer?: Layer.Layer<CommandExecutor.CommandExecutor>;
  };

export function makeApiLifecycleLayers(
  overrides: Partial<AppConfigShape> = {},
  options?: ApiLifecycleOptions,
) {
  // Platform core: config, database, runtime primitives, logging.
  const platformCoreLayer = makeAppPlatformCoreRuntimeLayer(overrides, options);
  const platformRuntimeLayer = options?.commandExecutorLayer
    ? Layer.mergeAll(platformCoreLayer, options.commandExecutorLayer)
    : platformCoreLayer;

  // Runtime config graph: system config -> validated runtime snapshot.
  const systemConfigLayer = SystemConfigServiceLive.pipe(Layer.provide(platformRuntimeLayer));
  const runtimeConfigSnapshotLayer = RuntimeConfigSnapshotServiceLive.pipe(
    Layer.provide(systemConfigLayer),
  );

  // External clients depend on runtime config + platform runtime.
  const externalClientLayer = makeAppExternalClientLayer(options).pipe(
    Layer.provide(Layer.mergeAll(platformRuntimeLayer, runtimeConfigSnapshotLayer)),
  );

  // Infrastructure layer adds command-backed probing services.
  const platformExternalLayer = Layer.mergeAll(platformRuntimeLayer, externalClientLayer);
  const infrastructureLayer = Layer.mergeAll(MediaProbeLive, DiskSpaceInspectorLive).pipe(
    Layer.provide(platformExternalLayer),
  );
  const platformLayer = Layer.mergeAll(platformExternalLayer, infrastructureLayer);
  const runtimeSupportLayer = Layer.mergeAll(
    platformLayer,
    systemConfigLayer,
    runtimeConfigSnapshotLayer,
  );

  // Domain feature subgraphs.
  const animeLayer = makeAnimeAppLayer(runtimeSupportLayer);
  const { catalogDownloadReadLayer, operationsLayer, operationsProgressLayer, torrentClientLayer } =
    makeOperationsAppLayers(runtimeSupportLayer);
  const appDomainSubgraphLayer = Layer.mergeAll(animeLayer, operationsLayer);

  // Background worker runtime sits on top of domain + runtime support.
  const { backgroundControllerLayer, runtimeWorkerSubgraphLayer } = makeBackgroundAppLayers({
    appDomainSubgraphLayer,
    runtimeSupportLayer,
  });

  // System + auth + orchestration features.
  const systemLayer = makeSystemAppLayer({
    backgroundControllerLayer,
    catalogDownloadReadLayer,
    runtimeSupportLayer,
  });

  const authLayer = makeAuthAppLayer(runtimeSupportLayer);

  const operationsTaskLayer = OperationsTaskServiceLive.pipe(Layer.provide(runtimeSupportLayer));
  const operationsTaskLauncherLayer = OperationsTaskLauncherServiceLive.pipe(
    Layer.provide(Layer.mergeAll(runtimeSupportLayer, operationsLayer, operationsTaskLayer)),
  );
  const libraryLayer = LibraryBrowseServiceLive.pipe(
    Layer.provide(Layer.mergeAll(systemLayer, operationsLayer)),
  );
  const animeEnrollmentLayer = AnimeEnrollmentServiceLive.pipe(
    Layer.provide(Layer.mergeAll(animeLayer, operationsLayer, operationsTaskLauncherLayer)),
  );

  const appFeatureBaseLayer = Layer.mergeAll(
    appDomainSubgraphLayer,
    runtimeWorkerSubgraphLayer,
    authLayer,
    systemLayer,
    libraryLayer,
    animeEnrollmentLayer,
    operationsTaskLayer,
  );
  const appFeatureSubgraphLayer = Layer.mergeAll(appFeatureBaseLayer, operationsTaskLauncherLayer);
  const featureLayer = appFeatureSubgraphLayer.pipe(Layer.provide(runtimeSupportLayer));
  const appLayer = Layer.mergeAll(runtimeSupportLayer, featureLayer);

  return {
    appLayer,
    operationsProgressLayer,
    platformLayer,
    torrentClientLayer,
  } as const;
}
