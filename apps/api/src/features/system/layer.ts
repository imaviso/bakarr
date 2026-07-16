import { Layer } from "effect";

import { BackgroundJobRepository } from "@/features/system/repository/background-job-repository.ts";
import { QualityProfileRepository } from "@/features/system/repository/quality-profile-repository.ts";
import { ReleaseProfileRepository } from "@/features/system/repository/release-profile-repository.ts";
import { SystemConfigRepository } from "@/features/system/repository/system-config-repository.ts";
import { SystemLogRepository } from "@/features/system/repository/log-repository.ts";
import { SystemStatsRepository } from "@/features/system/repository/stats-repository.ts";
import { BackgroundJobStatusServiceLive } from "@/features/system/background-job-status-service.ts";
import { ImageAssetServiceLive } from "@/features/system/image-asset-service.ts";
import { QualityProfileServiceLive } from "@/features/system/quality-profile-service.ts";
import { ReleaseProfileServiceLive } from "@/features/system/release-profile-service.ts";
import { RuntimeConfigSnapshotServiceLive } from "@/features/system/runtime-config-snapshot-service.ts";
import { SystemBootstrapServiceLive } from "@/features/system/system-bootstrap-service.ts";
import { SystemConfigServiceLive } from "@/features/system/system-config-service.ts";
import { SystemConfigUpdateServiceLive } from "@/features/system/system-config-update-service.ts";
import { SystemEventsServiceLive } from "@/features/system/system-events-service.ts";
import { SystemLogServiceLive } from "@/features/system/system-log-service.ts";
import { SystemReadServiceLive } from "@/features/system/system-read-service.ts";
import { SystemRuntimeMetricsServiceLive } from "@/features/system/system-runtime-metrics-service.ts";

export function makeSystemConfigLayers<ROut, E, RIn>(
  runtimeSupportLayer: Layer.Layer<ROut, E, RIn>,
) {
  const systemConfigRepositoryLayer = Layer.mergeAll(
    SystemConfigRepository.Default,
    QualityProfileRepository.Default,
  ).pipe(Layer.provide(runtimeSupportLayer));
  const systemConfigLayer = SystemConfigServiceLive.pipe(
    Layer.provide(systemConfigRepositoryLayer),
  );
  const runtimeConfigSnapshotLayer = RuntimeConfigSnapshotServiceLive.pipe(
    Layer.provide(systemConfigLayer),
  );

  return {
    runtimeConfigSnapshotLayer,
    systemConfigLayer,
    systemConfigRepositoryLayer,
  } as const;
}

export function makeSystemFeatureLayer<
  RuntimeOut,
  RuntimeError,
  RuntimeIn,
  BackgroundOut,
  BackgroundError,
  BackgroundIn,
  OperationsOut,
  OpsE,
  OperationsIn,
  SystemConfigOut,
  SystemConfigError,
  SystemConfigIn,
  SystemConfigRepositoryOut,
  SystemConfigRepositoryError,
  SystemConfigRepositoryIn,
>(input: {
  readonly backgroundControllerLayer: Layer.Layer<BackgroundOut, BackgroundError, BackgroundIn>;
  readonly operationsLayer: Layer.Layer<OperationsOut, OpsE, OperationsIn>;
  readonly runtimeSupportLayer: Layer.Layer<RuntimeOut, RuntimeError, RuntimeIn>;
  readonly systemConfigLayer: Layer.Layer<SystemConfigOut, SystemConfigError, SystemConfigIn>;
  readonly systemConfigRepositoryLayer: Layer.Layer<
    SystemConfigRepositoryOut,
    SystemConfigRepositoryError,
    SystemConfigRepositoryIn
  >;
}) {
  const pureSystemRepos = Layer.mergeAll(
    BackgroundJobRepository.Default,
    QualityProfileRepository.Default,
    SystemStatsRepository.Default,
    SystemLogRepository.Default,
    ReleaseProfileRepository.Default,
  ).pipe(Layer.provide(input.runtimeSupportLayer));

  const runtimeWithBackgroundControllerLayer = Layer.mergeAll(
    input.runtimeSupportLayer,
    input.backgroundControllerLayer,
  );
  const backgroundJobStatusLayer = BackgroundJobStatusServiceLive.pipe(
    Layer.provide(Layer.mergeAll(runtimeWithBackgroundControllerLayer, pureSystemRepos)),
  );
  const runtimeWithBackgroundJobStatusLayer = Layer.mergeAll(
    input.runtimeSupportLayer,
    pureSystemRepos,
    backgroundJobStatusLayer,
  );
  const systemReadLayer = SystemReadServiceLive.pipe(
    Layer.provide(runtimeWithBackgroundJobStatusLayer),
  );
  const systemRuntimeMetricsLayer = SystemRuntimeMetricsServiceLive.pipe(
    Layer.provide(Layer.mergeAll(systemReadLayer, input.runtimeSupportLayer)),
  );

  const systemLayer = Layer.mergeAll(
    SystemBootstrapServiceLive.pipe(
      Layer.provide(Layer.mergeAll(input.runtimeSupportLayer, input.systemConfigRepositoryLayer)),
    ),
    ImageAssetServiceLive.pipe(Layer.provide(input.runtimeSupportLayer)),
    QualityProfileServiceLive.pipe(
      Layer.provide(Layer.mergeAll(input.runtimeSupportLayer, pureSystemRepos)),
    ),
    ReleaseProfileServiceLive.pipe(
      Layer.provide(Layer.mergeAll(input.runtimeSupportLayer, pureSystemRepos)),
    ),
    SystemLogServiceLive.pipe(
      Layer.provide(Layer.mergeAll(input.runtimeSupportLayer, pureSystemRepos)),
    ),
    backgroundJobStatusLayer,
    systemReadLayer,
    systemRuntimeMetricsLayer,
    SystemConfigUpdateServiceLive.pipe(
      Layer.provide(Layer.mergeAll(runtimeWithBackgroundControllerLayer, pureSystemRepos)),
    ),
    SystemEventsServiceLive.pipe(
      Layer.provide(Layer.mergeAll(input.runtimeSupportLayer, input.operationsLayer)),
    ),
  );

  const repositoriesLayer = pureSystemRepos;

  return {
    repositoriesLayer,
    runtimeWithBackgroundControllerLayer,
    systemLayer,
  } as const;
}
