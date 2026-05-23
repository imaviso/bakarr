import { CommandExecutor } from "@effect/platform";
import { Layer } from "effect";

import {
  makeAppExternalClientLayer,
  type AppExternalClientLayerOptions,
} from "@/app/platform/external-clients-layer.ts";
import {
  makeAppPlatformCoreRuntimeLayer,
  type AppPlatformRuntimeOptions,
} from "@/app/platform/runtime-core.ts";
import type { AppConfigOverrides, BootstrapConfigOverrides } from "@/config/schema.ts";
import type { ObservabilityConfigOverrides } from "@/config/observability.ts";
import { BackgroundWorkerControllerLive } from "@/background/controller-core.ts";
import { BackgroundTaskRunnerLive } from "@/background/task-runner.ts";
import { AnimeEnrollmentServiceLive } from "@/features/media/add/media-enrollment-service.ts";
import { makeAnimeFeatureLayer } from "@/features/media/layer.ts";
import { makeAuthFeatureLayer } from "@/features/auth/layer.ts";
import { makeOperationsFeatureLayer } from "@/features/operations/layer.ts";
import { MediaReadRepository } from "@/features/media/shared/media-read-repository.ts";
import { OperationsConfigRepository } from "@/features/operations/repository/config-repository.ts";
import { OperationsProfileRepository } from "@/features/operations/repository/profile-repository.ts";
import { SystemUnmappedRepository } from "@/features/system/repository/unmapped-repository.ts";
import { LibraryBrowseServiceLive } from "@/features/operations/library/library-browse-service.ts";
import { OperationsTaskLauncherServiceLive } from "@/features/operations/tasks/operations-task-launcher-service.ts";
import { DiskSpaceInspectorLive } from "@/features/system/disk-space.ts";
import { makeSystemConfigLayers, makeSystemFeatureLayer } from "@/features/system/layer.ts";
import { MediaProbeLive } from "@/infra/media/probe.ts";

export type ApiLifecycleOptions = AppPlatformRuntimeOptions &
  AppExternalClientLayerOptions & {
    readonly commandExecutorLayer?: Layer.Layer<CommandExecutor.CommandExecutor>;
  };

export function makeApiLifecycleLayers(
  overrides: AppConfigOverrides & BootstrapConfigOverrides & ObservabilityConfigOverrides = {},
  options?: ApiLifecycleOptions,
) {
  // Platform core: config, database, runtime primitives, logging.
  const platformCoreLayer = makeAppPlatformCoreRuntimeLayer(overrides, options);
  const platformRuntimeLayer = options?.commandExecutorLayer
    ? Layer.mergeAll(platformCoreLayer, options.commandExecutorLayer)
    : platformCoreLayer;

  // Runtime config graph: system config -> validated runtime snapshot.
  const { runtimeConfigSnapshotLayer, systemConfigLayer, systemConfigRepositoryLayer } =
    makeSystemConfigLayers(platformRuntimeLayer);
  const configRuntimeLayer = Layer.mergeAll(platformRuntimeLayer, runtimeConfigSnapshotLayer);

  // External clients depend on runtime config + platform runtime.
  const externalClientLayer = makeAppExternalClientLayer(options).pipe(
    Layer.provide(configRuntimeLayer),
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
  const mediaReadRepositoryLayer = MediaReadRepository.Default.pipe(
    Layer.provide(runtimeSupportLayer),
  );
  const operationsConfigRepositoryLayer = OperationsConfigRepository.Default.pipe(
    Layer.provide(runtimeSupportLayer),
  );
  const operationsProfileRepositoryLayer = OperationsProfileRepository.Default.pipe(
    Layer.provide(runtimeSupportLayer),
  );
  const systemUnmappedRepositoryLayer = SystemUnmappedRepository.Default.pipe(
    Layer.provide(runtimeSupportLayer),
  );

  // Media feature graph owns its internal service wiring.
  const animeLiveLayer = makeAnimeFeatureLayer(runtimeSupportLayer);

  const operationsLayer = makeOperationsFeatureLayer(runtimeSupportLayer);
  const appDomainSubgraphLayer = Layer.mergeAll(animeLiveLayer, operationsLayer);

  // Background worker runtime sits on top of domain + runtime support.
  const backgroundTaskRunnerLayer = BackgroundTaskRunnerLive.pipe(
    Layer.provide(Layer.mergeAll(appDomainSubgraphLayer, runtimeSupportLayer)),
  );
  const backgroundControllerLayer = BackgroundWorkerControllerLive.pipe(
    Layer.provide(Layer.mergeAll(backgroundTaskRunnerLayer, runtimeSupportLayer)),
  );
  const runtimeWorkerSubgraphLayer = Layer.mergeAll(
    backgroundTaskRunnerLayer,
    backgroundControllerLayer,
  );

  // System + auth + orchestration features.
  const { repositoriesLayer: systemRepositoriesLayer, systemLayer } = makeSystemFeatureLayer({
    backgroundControllerLayer,
    operationsLayer,
    runtimeSupportLayer,
    systemConfigLayer,
    systemConfigRepositoryLayer,
  });

  const authLayer = makeAuthFeatureLayer(runtimeSupportLayer);

  const operationsTaskLauncherLayer = OperationsTaskLauncherServiceLive.pipe(
    Layer.provide(operationsLayer),
  );
  const libraryLayer = LibraryBrowseServiceLive.pipe(
    Layer.provide(Layer.mergeAll(systemLayer, operationsLayer)),
  );
  const animeEnrollmentLayer = AnimeEnrollmentServiceLive.pipe(
    Layer.provide(Layer.mergeAll(animeLiveLayer, operationsLayer, operationsTaskLauncherLayer)),
  );

  const appFeatureBaseLayer = Layer.mergeAll(
    appDomainSubgraphLayer,
    runtimeWorkerSubgraphLayer,
    authLayer,
    systemLayer,
    libraryLayer,
    animeEnrollmentLayer,
  );
  const appFeatureSubgraphLayer = Layer.mergeAll(appFeatureBaseLayer, operationsTaskLauncherLayer);
  const appLayer = Layer.mergeAll(
    runtimeSupportLayer,
    systemRepositoriesLayer,
    appFeatureSubgraphLayer.pipe(
      Layer.provide(
        Layer.mergeAll(
          runtimeSupportLayer,
          mediaReadRepositoryLayer,
          operationsConfigRepositoryLayer,
          operationsProfileRepositoryLayer,
          systemConfigRepositoryLayer,
          systemRepositoriesLayer,
          systemUnmappedRepositoryLayer,
        ),
      ),
    ),
  );

  return {
    appLayer,
  } as const;
}
