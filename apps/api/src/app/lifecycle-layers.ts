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
import { providePureDbLeaves } from "@/app/pure-db-leaves.ts";
import type { AppConfigOverrides, BootstrapConfigOverrides } from "@/config/schema.ts";
import type { ObservabilityConfigOverrides } from "@/config/observability.ts";
import { BackgroundWorkerControllerLive } from "@/background/controller-core.ts";
import { BackgroundTaskRunnerLive } from "@/background/task-runner.ts";
import { MediaEnrollmentServiceLive } from "@/features/media/add/media-enrollment-service.ts";
import { makeMediaFeatureLayer } from "@/features/media/layer.ts";
import { makeAuthFeatureLayer } from "@/features/auth/layer.ts";
import { makeOperationsFeatureLayer } from "@/features/operations/layer.ts";
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

  // PureDbLeaves provided once — feature layers receive it for construction only.
  const pureDbLeaves = providePureDbLeaves(runtimeSupportLayer);

  const mediaFeatureLayer = makeMediaFeatureLayer(runtimeSupportLayer, pureDbLeaves);
  const operationsLayer = makeOperationsFeatureLayer(runtimeSupportLayer, pureDbLeaves);
  const appDomainSubgraphLayer = Layer.mergeAll(mediaFeatureLayer, operationsLayer);

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

  // Enrollment bridges media + ops (missing-search + task launcher live in ops layer).
  const mediaEnrollmentLayer = MediaEnrollmentServiceLive.pipe(
    Layer.provide(appDomainSubgraphLayer),
  );

  const appFeatureBaseLayer = Layer.mergeAll(
    appDomainSubgraphLayer,
    runtimeWorkerSubgraphLayer,
    authLayer,
    systemLayer,
    mediaEnrollmentLayer,
  );

  const appLayer = Layer.mergeAll(
    runtimeSupportLayer,
    pureDbLeaves,
    systemRepositoriesLayer,
    appFeatureBaseLayer.pipe(
      Layer.provide(
        Layer.mergeAll(
          runtimeSupportLayer,
          systemConfigRepositoryLayer,
          systemRepositoriesLayer,
          pureDbLeaves,
        ),
      ),
    ),
  );

  return {
    appLayer,
  } as const;
}
