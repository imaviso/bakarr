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
import { SystemLogRepository } from "@/features/system/repository/log-repository.ts";
import { ReleaseProfileRepository } from "@/features/system/repository/release-profile-repository.ts";
import { SystemStatsRepository } from "@/features/system/repository/stats-repository.ts";
import { SystemUnmappedRepository } from "@/features/system/repository/unmapped-repository.ts";
import { LibraryBrowseServiceLive } from "@/features/operations/library/library-browse-service.ts";
import { OperationsTaskLauncherServiceLive } from "@/features/operations/tasks/operations-task-launcher-service.ts";
import { BackgroundJobStatusServiceLive } from "@/features/system/background-job-status-service.ts";
import { RuntimeConfigSnapshotServiceLive } from "@/features/system/runtime-config-snapshot-service.ts";
import { SystemConfigServiceLive } from "@/features/system/system-config-service.ts";
import { ImageAssetServiceLive } from "@/features/system/image-asset-service.ts";
import { QualityProfileServiceLive } from "@/features/system/quality-profile-service.ts";
import { ReleaseProfileServiceLive } from "@/features/system/release-profile-service.ts";
import { DiskSpaceInspectorLive } from "@/features/system/disk-space.ts";
import { SystemBootstrapServiceLive } from "@/features/system/system-bootstrap-service.ts";
import { SystemConfigUpdateServiceLive } from "@/features/system/system-config-update-service.ts";
import { SystemEventsServiceLive } from "@/features/system/system-events-service.ts";
import { SystemLogServiceLive } from "@/features/system/system-log-service.ts";
import { SystemReadServiceLive } from "@/features/system/system-read-service.ts";
import { SystemRuntimeMetricsServiceLive } from "@/features/system/system-runtime-metrics-service.ts";
import { QualityProfileRepository } from "@/features/system/repository/quality-profile-repository.ts";
import { SystemConfigRepository } from "@/features/system/repository/system-config-repository.ts";
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
  const systemConfigRepositoryLayer = Layer.mergeAll(
    SystemConfigRepository.Default,
    QualityProfileRepository.Default,
  ).pipe(Layer.provide(platformRuntimeLayer));
  const qualityProfileRepositoryLayer = QualityProfileRepository.Default.pipe(
    Layer.provide(platformRuntimeLayer),
  );
  const systemConfigLayer = SystemConfigServiceLive.pipe(
    Layer.provide(systemConfigRepositoryLayer),
  );
  const runtimeConfigSnapshotLayer = RuntimeConfigSnapshotServiceLive.pipe(
    Layer.provide(systemConfigLayer),
  );
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
  const systemStatsRepositoryLayer = SystemStatsRepository.Default.pipe(
    Layer.provide(runtimeSupportLayer),
  );
  const systemLogRepositoryLayer = SystemLogRepository.Default.pipe(
    Layer.provide(runtimeSupportLayer),
  );
  const releaseProfileRepositoryLayer = ReleaseProfileRepository.Default.pipe(
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
  const runtimeWithBackgroundControllerLayer = Layer.mergeAll(
    runtimeSupportLayer,
    backgroundControllerLayer,
  );
  const backgroundJobStatusLayer = BackgroundJobStatusServiceLive.pipe(
    Layer.provide(Layer.mergeAll(runtimeWithBackgroundControllerLayer, systemStatsRepositoryLayer)),
  );
  const runtimeWithBackgroundJobStatusLayer = Layer.mergeAll(
    runtimeSupportLayer,
    systemStatsRepositoryLayer,
    backgroundJobStatusLayer,
  );
  const systemReadLayer = SystemReadServiceLive.pipe(
    Layer.provide(runtimeWithBackgroundJobStatusLayer),
  );
  const systemRuntimeMetricsLayer = SystemRuntimeMetricsServiceLive.pipe(
    Layer.provide(systemReadLayer),
  );
  const systemLayer = Layer.mergeAll(
    SystemBootstrapServiceLive.pipe(
      Layer.provide(Layer.mergeAll(runtimeSupportLayer, systemConfigRepositoryLayer)),
    ),
    ImageAssetServiceLive.pipe(Layer.provide(runtimeSupportLayer)),
    QualityProfileServiceLive.pipe(
      Layer.provide(
        Layer.mergeAll(
          runtimeSupportLayer,
          qualityProfileRepositoryLayer,
          systemLogRepositoryLayer,
        ),
      ),
    ),
    ReleaseProfileServiceLive.pipe(
      Layer.provide(
        Layer.mergeAll(
          runtimeSupportLayer,
          releaseProfileRepositoryLayer,
          systemLogRepositoryLayer,
        ),
      ),
    ),
    SystemLogServiceLive.pipe(
      Layer.provide(Layer.mergeAll(runtimeSupportLayer, systemLogRepositoryLayer)),
    ),
    backgroundJobStatusLayer,
    systemReadLayer,
    systemRuntimeMetricsLayer,
    SystemConfigUpdateServiceLive.pipe(
      Layer.provide(
        Layer.mergeAll(
          runtimeWithBackgroundControllerLayer,
          systemConfigRepositoryLayer,
          qualityProfileRepositoryLayer,
          systemLogRepositoryLayer,
        ),
      ),
    ),
    SystemEventsServiceLive.pipe(
      Layer.provide(Layer.mergeAll(runtimeSupportLayer, operationsLayer)),
    ),
  );

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
    mediaReadRepositoryLayer,
    operationsConfigRepositoryLayer,
    operationsProfileRepositoryLayer,
    systemLogRepositoryLayer,
    releaseProfileRepositoryLayer,
    systemStatsRepositoryLayer,
    systemUnmappedRepositoryLayer,
    appFeatureSubgraphLayer.pipe(
      Layer.provide(
        Layer.mergeAll(
          runtimeSupportLayer,
          mediaReadRepositoryLayer,
          operationsConfigRepositoryLayer,
          operationsProfileRepositoryLayer,
          systemLogRepositoryLayer,
          releaseProfileRepositoryLayer,
          systemStatsRepositoryLayer,
          systemUnmappedRepositoryLayer,
        ),
      ),
    ),
  );

  return {
    appLayer,
  } as const;
}
