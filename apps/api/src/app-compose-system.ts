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
import { SystemReadServiceLive } from "@/features/system/system-read-service.ts";
import { SystemRuntimeMetricsServiceLive } from "@/features/system/system-runtime-metrics-service.ts";
import { SystemStatusReadServiceLive } from "@/features/system/system-status-read-service.ts";

export function makeSystemAppLayer<BCOut, BCE, BCR, CDOut, CDE, CDR, RSOut, RSE, RSR>(input: {
  readonly backgroundControllerLayer: Layer.Layer<BCOut, BCE, BCR>;
  readonly catalogDownloadReadLayer: Layer.Layer<CDOut, CDE, CDR>;
  readonly runtimeSupportLayer: Layer.Layer<RSOut, RSE, RSR>;
}) {
  const backgroundJobStatusLayer = BackgroundJobStatusServiceLive.pipe(
    Layer.provideMerge(Layer.mergeAll(input.runtimeSupportLayer, input.backgroundControllerLayer)),
  );
  const systemStatusReadLayer = SystemStatusReadServiceLive.pipe(
    Layer.provideMerge(Layer.mergeAll(input.runtimeSupportLayer, backgroundJobStatusLayer)),
  );
  const systemLibraryStatsReadLayer = SystemLibraryStatsReadServiceLive.pipe(
    Layer.provideMerge(input.runtimeSupportLayer),
  );
  const systemActivityReadLayer = SystemActivityReadServiceLive.pipe(
    Layer.provideMerge(input.runtimeSupportLayer),
  );
  const systemDashboardReadLayer = SystemDashboardReadServiceLive.pipe(
    Layer.provideMerge(Layer.mergeAll(input.runtimeSupportLayer, backgroundJobStatusLayer)),
  );
  const systemRuntimeMetricsLayer = SystemRuntimeMetricsServiceLive.pipe(
    Layer.provideMerge(
      Layer.mergeAll(input.runtimeSupportLayer, systemStatusReadLayer, systemLibraryStatsReadLayer),
    ),
  );
  const systemReadLayer = SystemReadServiceLive.pipe(
    Layer.provideMerge(
      Layer.mergeAll(
        backgroundJobStatusLayer,
        systemStatusReadLayer,
        systemLibraryStatsReadLayer,
        systemActivityReadLayer,
        systemDashboardReadLayer,
        systemRuntimeMetricsLayer,
      ),
    ),
  );
  const systemMetricsEndpointLayer = SystemMetricsEndpointServiceLive.pipe(
    Layer.provideMerge(Layer.mergeAll(input.runtimeSupportLayer, systemRuntimeMetricsLayer)),
  );
  const imageAssetLayer = ImageAssetServiceLive.pipe(Layer.provideMerge(input.runtimeSupportLayer));
  const systemEventsLayer = SystemEventsServiceLive.pipe(
    Layer.provideMerge(Layer.mergeAll(input.runtimeSupportLayer, input.catalogDownloadReadLayer)),
  );
  const systemConfigUpdateLayer = SystemConfigUpdateServiceLive.pipe(
    Layer.provideMerge(Layer.mergeAll(input.runtimeSupportLayer, input.backgroundControllerLayer)),
  );
  const qualityProfileLayer = QualityProfileServiceLive.pipe(
    Layer.provideMerge(input.runtimeSupportLayer),
  );
  const releaseProfileLayer = ReleaseProfileServiceLive.pipe(
    Layer.provideMerge(input.runtimeSupportLayer),
  );
  const systemLogLayer = SystemLogServiceLive.pipe(Layer.provideMerge(input.runtimeSupportLayer));
  const systemBootstrapLayer = SystemBootstrapServiceLive.pipe(
    Layer.provideMerge(input.runtimeSupportLayer),
  );

  return Layer.mergeAll(
    systemBootstrapLayer,
    backgroundJobStatusLayer,
    systemConfigUpdateLayer,
    systemStatusReadLayer,
    systemLibraryStatsReadLayer,
    systemActivityReadLayer,
    systemDashboardReadLayer,
    systemRuntimeMetricsLayer,
    systemReadLayer,
    systemMetricsEndpointLayer,
    imageAssetLayer,
    systemEventsLayer,
    qualityProfileLayer,
    releaseProfileLayer,
    systemLogLayer,
  );
}
