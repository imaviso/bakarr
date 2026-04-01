import { Layer } from "effect";

import { BackgroundJobStatusServiceLive } from "@/features/system/background-job-status-service.ts";
import { ImageAssetServiceLive } from "@/features/system/image-asset-service.ts";
import { MetricsServiceLive } from "@/features/system/metrics-service.ts";
import { QualityProfileServiceLive } from "@/features/system/quality-profile-service.ts";
import { ReleaseProfileServiceLive } from "@/features/system/release-profile-service.ts";
import { RuntimeConfigSnapshotServiceLive } from "@/features/system/runtime-config-snapshot-service.ts";
import { SystemEventsServiceLive } from "@/features/system/system-events-service.ts";
import { SystemMetricsEndpointServiceLive } from "@/features/system/system-metrics-endpoint-service.ts";
import { SystemBootstrapServiceLive } from "@/features/system/system-bootstrap-service.ts";
import { SystemConfigUpdateServiceLive } from "@/features/system/system-config-update-service.ts";
import { SystemConfigServiceLive } from "@/features/system/system-config-service.ts";
import { SystemLogServiceLive } from "@/features/system/system-log-service.ts";
import { SystemReadServiceLive } from "@/features/system/system-read-service.ts";

const systemConfigLayer = SystemConfigServiceLive;
const runtimeConfigSnapshotLayer = RuntimeConfigSnapshotServiceLive.pipe(
  Layer.provide(systemConfigLayer),
);
const backgroundJobStatusLayer = BackgroundJobStatusServiceLive.pipe(
  Layer.provide(runtimeConfigSnapshotLayer),
);
const systemReadLayer = SystemReadServiceLive.pipe(
  Layer.provide(Layer.mergeAll(runtimeConfigSnapshotLayer, backgroundJobStatusLayer)),
);
const metricsLayer = MetricsServiceLive.pipe(Layer.provide(systemReadLayer));
const metricsEndpointLayer = SystemMetricsEndpointServiceLive.pipe(Layer.provide(metricsLayer));
const imageAssetLayer = ImageAssetServiceLive;
const eventsLayer = SystemEventsServiceLive;
const systemConfigUpdateLayer = SystemConfigUpdateServiceLive;

export const SystemFeatureLive = Layer.mergeAll(
  SystemBootstrapServiceLive,
  systemConfigLayer,
  runtimeConfigSnapshotLayer,
  backgroundJobStatusLayer,
  systemConfigUpdateLayer,
  systemReadLayer,
  metricsLayer,
  metricsEndpointLayer,
  imageAssetLayer,
  eventsLayer,
  QualityProfileServiceLive,
  ReleaseProfileServiceLive,
  SystemLogServiceLive,
);
