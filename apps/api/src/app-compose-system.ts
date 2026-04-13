import { Layer } from "effect";

import { BackgroundJobStatusServiceLive } from "@/features/system/background-job-status-service.ts";
import { ImageAssetServiceLive } from "@/features/system/image-asset-service.ts";
import { QualityProfileServiceLive } from "@/features/system/quality-profile-service.ts";
import { ReleaseProfileServiceLive } from "@/features/system/release-profile-service.ts";
import { SystemActivityReadServiceLive } from "@/features/system/system-activity-read-service.ts";
import { SystemBootstrapServiceLive } from "@/features/system/system-bootstrap-service.ts";
import { SystemConfigUpdateServiceLive } from "@/features/system/system-config-update-service.ts";
import { SystemDashboardReadServiceLive } from "@/features/system/system-dashboard-read-service.ts";
import { SystemEventsServiceLive } from "@/features/system/system-events-service.ts";
import { SystemLibraryStatsReadServiceLive } from "@/features/system/system-library-stats-read-service.ts";
import { SystemLogServiceLive } from "@/features/system/system-log-service.ts";
import { SystemMetricsEndpointServiceLive } from "@/features/system/system-metrics-endpoint-service.ts";
import { SystemRuntimeMetricsServiceLive } from "@/features/system/system-runtime-metrics-service.ts";
import { SystemStatusReadServiceLive } from "@/features/system/system-status-read-service.ts";

interface SystemAppLayerInput<BCOut, BCE, BCR, CDOut, CDE, CDR, RSOut, RSE, RSR> {
  readonly backgroundControllerLayer: Layer.Layer<BCOut, BCE, BCR>;
  readonly catalogDownloadReadLayer: Layer.Layer<CDOut, CDE, CDR>;
  readonly runtimeSupportLayer: Layer.Layer<RSOut, RSE, RSR>;
}

export function makeSystemAppLayer<BCOut, BCE, BCR, CDOut, CDE, CDR, RSOut, RSE, RSR>(
  input: SystemAppLayerInput<BCOut, BCE, BCR, CDOut, CDE, CDR, RSOut, RSE, RSR>,
) {
  const { backgroundControllerLayer, catalogDownloadReadLayer, runtimeSupportLayer } = input;
  const runtimeWithBackgroundControllerLayer = Layer.mergeAll(
    runtimeSupportLayer,
    backgroundControllerLayer,
  );
  const backgroundJobStatusLayer = BackgroundJobStatusServiceLive.pipe(
    Layer.provide(runtimeWithBackgroundControllerLayer),
  );
  const runtimeWithBackgroundJobStatusLayer = Layer.mergeAll(
    runtimeSupportLayer,
    backgroundJobStatusLayer,
  );
  const systemStatusReadLayer = SystemStatusReadServiceLive.pipe(
    Layer.provide(runtimeWithBackgroundJobStatusLayer),
  );
  const systemLibraryStatsReadLayer = SystemLibraryStatsReadServiceLive.pipe(
    Layer.provide(runtimeSupportLayer),
  );
  const systemActivityReadLayer = SystemActivityReadServiceLive.pipe(
    Layer.provide(runtimeSupportLayer),
  );
  const systemDashboardReadLayer = SystemDashboardReadServiceLive.pipe(
    Layer.provide(runtimeWithBackgroundJobStatusLayer),
  );
  const systemRuntimeMetricsLayer = SystemRuntimeMetricsServiceLive.pipe(
    Layer.provide(Layer.mergeAll(systemStatusReadLayer, systemLibraryStatsReadLayer)),
  );

  const systemReadSubgraphLayer = Layer.mergeAll(
    backgroundJobStatusLayer,
    systemStatusReadLayer,
    systemLibraryStatsReadLayer,
    systemActivityReadLayer,
    systemDashboardReadLayer,
    systemRuntimeMetricsLayer,
  );

  const runtimeOnlySubgraphLayer = Layer.mergeAll(
    SystemBootstrapServiceLive.pipe(Layer.provide(runtimeSupportLayer)),
    ImageAssetServiceLive.pipe(Layer.provide(runtimeSupportLayer)),
    QualityProfileServiceLive.pipe(Layer.provide(runtimeSupportLayer)),
    ReleaseProfileServiceLive.pipe(Layer.provide(runtimeSupportLayer)),
    SystemLogServiceLive.pipe(Layer.provide(runtimeSupportLayer)),
  );

  const orchestrationSubgraphLayer = Layer.mergeAll(
    SystemConfigUpdateServiceLive.pipe(Layer.provide(runtimeWithBackgroundControllerLayer)),
    SystemEventsServiceLive.pipe(
      Layer.provide(Layer.mergeAll(runtimeSupportLayer, catalogDownloadReadLayer)),
    ),
    SystemMetricsEndpointServiceLive.pipe(Layer.provide(systemRuntimeMetricsLayer)),
  );

  return Layer.mergeAll(
    runtimeOnlySubgraphLayer,
    systemReadSubgraphLayer,
    orchestrationSubgraphLayer,
  );
}
