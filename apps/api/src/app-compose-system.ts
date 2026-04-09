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

interface SystemAppLayerInput<BCOut, BCE, BCR, CDOut, CDE, CDR, RSOut, RSE, RSR> {
  readonly backgroundControllerLayer: Layer.Layer<BCOut, BCE, BCR>;
  readonly catalogDownloadReadLayer: Layer.Layer<CDOut, CDE, CDR>;
  readonly runtimeSupportLayer: Layer.Layer<RSOut, RSE, RSR>;
}

export function makeSystemAppLayer<BCOut, BCE, BCR, CDOut, CDE, CDR, RSOut, RSE, RSR>(
  input: SystemAppLayerInput<BCOut, BCE, BCR, CDOut, CDE, CDR, RSOut, RSE, RSR>,
) {
  const { backgroundControllerLayer, catalogDownloadReadLayer, runtimeSupportLayer } = input;
  const withRuntime = provideFrom(runtimeSupportLayer);
  const withBackgroundController = provideFrom(backgroundControllerLayer);

  const buildReadLayers = () => {
    const backgroundRuntimeLayer = Layer.mergeAll(runtimeSupportLayer, backgroundControllerLayer);
    const backgroundJobStatusLayer = provideLayer(
      BackgroundJobStatusServiceLive,
      backgroundRuntimeLayer,
    );
    const systemStatusReadLayer = provideLayer(
      SystemStatusReadServiceLive,
      backgroundJobStatusLayer,
    );
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

    return {
      systemReadSubgraphLayer,
      systemRuntimeMetricsLayer,
    } as const;
  };

  const readLayers = buildReadLayers();

  const buildRuntimeOnlyLayers = () => {
    const imageAssetLayer = withRuntime(ImageAssetServiceLive);
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

    return {
      runtimeOnlySubgraphLayer,
    } as const;
  };

  const runtimeOnlyLayers = buildRuntimeOnlyLayers();

  const buildOrchestrationLayers = () => {
    const systemMetricsEndpointLayer = provideLayer(
      SystemMetricsEndpointServiceLive,
      readLayers.systemRuntimeMetricsLayer,
    );
    const systemEventsLayer = provideLayer(SystemEventsServiceLive, catalogDownloadReadLayer);
    const systemConfigUpdateLayer = withBackgroundController(SystemConfigUpdateServiceLive);

    const orchestrationSubgraphLayer = Layer.mergeAll(
      systemConfigUpdateLayer,
      systemEventsLayer,
      systemMetricsEndpointLayer,
    );

    return {
      orchestrationSubgraphLayer,
    } as const;
  };

  const orchestrationLayers = buildOrchestrationLayers();

  return Layer.mergeAll(
    runtimeOnlyLayers.runtimeOnlySubgraphLayer,
    readLayers.systemReadSubgraphLayer,
    orchestrationLayers.orchestrationSubgraphLayer,
  );
}
