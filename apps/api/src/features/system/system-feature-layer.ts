import { Layer } from "effect";

import { BackgroundJobStatusServiceLive } from "@/features/system/background-job-status-service.ts";
import { ImageAssetServiceLive } from "@/features/system/image-asset-service.ts";
import { QualityProfileServiceLive } from "@/features/system/quality-profile-service.ts";
import { ReleaseProfileServiceLive } from "@/features/system/release-profile-service.ts";
import { RuntimeConfigSnapshotServiceLive } from "@/features/system/runtime-config-snapshot-service.ts";
import { SystemActivityReadServiceLive } from "@/features/system/system-activity-read-service.ts";
import { SystemEventsServiceLive } from "@/features/system/system-events-service.ts";
import { SystemDashboardReadServiceLive } from "@/features/system/system-dashboard-read-service.ts";
import { SystemLibraryStatsReadServiceLive } from "@/features/system/system-library-stats-read-service.ts";
import { SystemMetricsEndpointServiceLive } from "@/features/system/system-metrics-endpoint-service.ts";
import { SystemBootstrapServiceLive } from "@/features/system/system-bootstrap-service.ts";
import { SystemConfigUpdateServiceLive } from "@/features/system/system-config-update-service.ts";
import { SystemConfigServiceLive } from "@/features/system/system-config-service.ts";
import { SystemLogServiceLive } from "@/features/system/system-log-service.ts";
import { SystemReadServiceLive } from "@/features/system/system-read-service.ts";
import { SystemRuntimeMetricsServiceLive } from "@/features/system/system-runtime-metrics-service.ts";
import { SystemStatusReadServiceLive } from "@/features/system/system-status-read-service.ts";

const systemConfigLayer = SystemConfigServiceLive;
const runtimeConfigSnapshotLayer = RuntimeConfigSnapshotServiceLive.pipe(
  Layer.provide(systemConfigLayer),
);
const backgroundJobStatusLayer = BackgroundJobStatusServiceLive.pipe(
  Layer.provide(runtimeConfigSnapshotLayer),
);
export const SystemRuntimeCoreLive = Layer.mergeAll(
  systemConfigLayer,
  runtimeConfigSnapshotLayer,
  backgroundJobStatusLayer,
);
const systemStatusReadLayer = SystemStatusReadServiceLive.pipe(
  Layer.provide(Layer.mergeAll(runtimeConfigSnapshotLayer, backgroundJobStatusLayer)),
);
const systemLibraryStatsReadLayer = SystemLibraryStatsReadServiceLive;
const systemActivityReadLayer = SystemActivityReadServiceLive;
const systemDashboardReadLayer = SystemDashboardReadServiceLive.pipe(
  Layer.provide(backgroundJobStatusLayer),
);
const systemRuntimeMetricsLayer = SystemRuntimeMetricsServiceLive.pipe(
  Layer.provide(Layer.mergeAll(systemStatusReadLayer, systemLibraryStatsReadLayer)),
);
const systemReadLayer = SystemReadServiceLive.pipe(
  Layer.provide(
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
const metricsEndpointLayer = SystemMetricsEndpointServiceLive.pipe(
  Layer.provide(systemRuntimeMetricsLayer),
);
const imageAssetLayer = ImageAssetServiceLive;
const eventsLayer = SystemEventsServiceLive;
const systemConfigUpdateLayer = SystemConfigUpdateServiceLive;

export const SystemFeatureLive = Layer.mergeAll(
  SystemBootstrapServiceLive,
  SystemRuntimeCoreLive,
  systemConfigUpdateLayer,
  systemStatusReadLayer,
  systemLibraryStatsReadLayer,
  systemActivityReadLayer,
  systemDashboardReadLayer,
  systemRuntimeMetricsLayer,
  systemReadLayer,
  metricsEndpointLayer,
  imageAssetLayer,
  eventsLayer,
  QualityProfileServiceLive,
  ReleaseProfileServiceLive,
  SystemLogServiceLive,
);
