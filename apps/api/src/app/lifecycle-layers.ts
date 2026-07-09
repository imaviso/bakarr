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
import { MediaUnitRepository } from "@/features/media/units/media-unit-repository.ts";
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
  const platformCoreLayer = makeAppPlatformCoreRuntimeLayer(overrides, options);
  const platformRuntimeLayer = options?.commandExecutorLayer
    ? Layer.mergeAll(platformCoreLayer, options.commandExecutorLayer)
    : platformCoreLayer;

  const { runtimeConfigSnapshotLayer, systemConfigLayer, systemConfigRepositoryLayer } =
    makeSystemConfigLayers(platformRuntimeLayer);
  const configRuntimeLayer = Layer.mergeAll(platformRuntimeLayer, runtimeConfigSnapshotLayer);

  const externalClientLayer = makeAppExternalClientLayer(options).pipe(
    Layer.provide(configRuntimeLayer),
  );

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

  const sharedRepos = Layer.mergeAll(
    MediaReadRepository.Default,
    MediaUnitRepository.Default,
    OperationsProfileRepository.Default,
    SystemUnmappedRepository.Default,
  ).pipe(Layer.provide(runtimeSupportLayer));

  const animeLiveLayer = makeAnimeFeatureLayer(runtimeSupportLayer);
  const operationsLayer = makeOperationsFeatureLayer(runtimeSupportLayer);
  const appDomainSubgraphLayer = Layer.mergeAll(animeLiveLayer, operationsLayer);

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
          systemConfigRepositoryLayer,
          systemRepositoriesLayer,
          sharedRepos,
        ),
      ),
    ),
  );

  return {
    appLayer,
  } as const;
}
