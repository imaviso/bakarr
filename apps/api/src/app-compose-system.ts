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
import { provideFrom, provideLayer } from "@/lib/layer-compose.ts";

type AnyLayer = Layer.Layer<any, any>;

interface SystemAppLayerInput {
  readonly backgroundControllerLayer: AnyLayer;
  readonly catalogDownloadReadLayer: AnyLayer;
  readonly runtimeSupportLayer: AnyLayer;
}

export function makeSystemAppLayer(input: SystemAppLayerInput) {
  const { backgroundControllerLayer, catalogDownloadReadLayer, runtimeSupportLayer } = input;
  const withRuntime = provideFrom(runtimeSupportLayer);
  const withBackgroundController = provideFrom(backgroundControllerLayer);

  const backgroundRuntimeLayer = Layer.mergeAll(runtimeSupportLayer, backgroundControllerLayer);
  const backgroundJobStatusLayer = provideLayer(
    BackgroundJobStatusServiceLive,
    backgroundRuntimeLayer,
  );
  const systemStatusReadLayer = provideLayer(SystemStatusReadServiceLive, backgroundJobStatusLayer);
  const systemLibraryStatsReadLayer = withRuntime(SystemLibraryStatsReadServiceLive);
  const systemActivityReadLayer = withRuntime(SystemActivityReadServiceLive);
  const systemDashboardReadLayer = provideLayer(
    SystemDashboardReadServiceLive,
    backgroundJobStatusLayer,
  );
  const systemRuntimeMetricsLayer = provideLayer(
    SystemRuntimeMetricsServiceLive,
    Layer.mergeAll(systemStatusReadLayer, systemLibraryStatsReadLayer),
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
    withRuntime(SystemBootstrapServiceLive),
    withRuntime(ImageAssetServiceLive),
    withRuntime(QualityProfileServiceLive),
    withRuntime(ReleaseProfileServiceLive),
    withRuntime(SystemLogServiceLive),
  );

  const orchestrationSubgraphLayer = Layer.mergeAll(
    withBackgroundController(SystemConfigUpdateServiceLive),
    provideLayer(SystemEventsServiceLive, catalogDownloadReadLayer),
    provideLayer(SystemMetricsEndpointServiceLive, systemRuntimeMetricsLayer),
  );

  return Layer.mergeAll(
    runtimeOnlySubgraphLayer,
    systemReadSubgraphLayer,
    orchestrationSubgraphLayer,
  );
}
