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

type LayerRef<Out, Err, Req> = Layer.Layer<Out, Err, Req>;

export function makeSystemAppLayer<BCOut, BCE, BCR, CDOut, CDE, CDR, RSOut, RSE, RSR>(input: {
  readonly backgroundControllerLayer: LayerRef<BCOut, BCE, BCR>;
  readonly catalogDownloadReadLayer: LayerRef<CDOut, CDE, CDR>;
  readonly runtimeSupportLayer: LayerRef<RSOut, RSE, RSR>;
}) {
  const withRuntime = <A, E, R>(layer: Layer.Layer<A, E, R>) =>
    layer.pipe(Layer.provideMerge(input.runtimeSupportLayer));
  const withBackgroundController = <A, E, R>(layer: Layer.Layer<A, E, R>) =>
    layer.pipe(Layer.provideMerge(input.backgroundControllerLayer));

  const backgroundRuntimeLayer = Layer.mergeAll(
    input.runtimeSupportLayer,
    input.backgroundControllerLayer,
  );
  const backgroundJobStatusLayer = BackgroundJobStatusServiceLive.pipe(
    Layer.provideMerge(backgroundRuntimeLayer),
  );
  const systemStatusReadLayer = SystemStatusReadServiceLive.pipe(
    Layer.provideMerge(backgroundJobStatusLayer),
  );
  const systemLibraryStatsReadLayer = withRuntime(SystemLibraryStatsReadServiceLive);
  const systemActivityReadLayer = withRuntime(SystemActivityReadServiceLive);
  const systemDashboardReadLayer = SystemDashboardReadServiceLive.pipe(
    Layer.provideMerge(backgroundJobStatusLayer),
  );
  const systemRuntimeMetricsLayer = SystemRuntimeMetricsServiceLive.pipe(
    Layer.provideMerge(systemStatusReadLayer),
    Layer.provideMerge(systemLibraryStatsReadLayer),
  );

  const systemReadSubgraphLayer = Layer.mergeAll(
    backgroundJobStatusLayer,
    systemStatusReadLayer,
    systemLibraryStatsReadLayer,
    systemActivityReadLayer,
    systemDashboardReadLayer,
    systemRuntimeMetricsLayer,
  );
  const systemMetricsEndpointLayer = SystemMetricsEndpointServiceLive.pipe(
    Layer.provideMerge(systemRuntimeMetricsLayer),
  );
  const imageAssetLayer = withRuntime(ImageAssetServiceLive);
  const systemEventsLayer = SystemEventsServiceLive.pipe(
    Layer.provideMerge(input.catalogDownloadReadLayer),
  );
  const systemConfigUpdateLayer = withBackgroundController(SystemConfigUpdateServiceLive);
  const qualityProfileLayer = withRuntime(QualityProfileServiceLive);
  const releaseProfileLayer = withRuntime(ReleaseProfileServiceLive);
  const systemLogLayer = withRuntime(SystemLogServiceLive);
  const systemBootstrapLayer = withRuntime(SystemBootstrapServiceLive);

  const runtimeOnlySubgraphLayer = Layer.mergeAll(
    systemBootstrapLayer,
    imageAssetLayer,
    qualityProfileLayer,
    releaseProfileLayer,
    systemLogLayer,
  );

  const orchestrationSubgraphLayer = Layer.mergeAll(
    systemConfigUpdateLayer,
    systemEventsLayer,
    systemMetricsEndpointLayer,
  );

  return Layer.mergeAll(
    runtimeOnlySubgraphLayer,
    systemReadSubgraphLayer,
    orchestrationSubgraphLayer,
  );
}
