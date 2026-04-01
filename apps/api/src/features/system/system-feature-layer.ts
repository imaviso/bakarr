import { Layer } from "effect";

import { BackgroundJobStatusServiceLive } from "@/features/system/background-job-status-service.ts";
import { ImageAssetServiceLive } from "@/features/system/image-asset-service.ts";
import { MetricsServiceLive } from "@/features/system/metrics-service.ts";
import { QualityProfileServiceLive } from "@/features/system/quality-profile-service.ts";
import { ReleaseProfileServiceLive } from "@/features/system/release-profile-service.ts";
import { SystemBootstrapServiceLive } from "@/features/system/system-bootstrap-service.ts";
import { SystemConfigUpdateServiceLive } from "@/features/system/system-config-update-service.ts";
import { SystemConfigServiceLive } from "@/features/system/system-config-service.ts";
import { SystemDashboardServiceLive } from "@/features/system/system-dashboard-service.ts";
import { SystemLogServiceLive } from "@/features/system/system-log-service.ts";
import { SystemStatusServiceLive } from "@/features/system/system-status-service.ts";
import { SystemSummaryServiceLive } from "@/features/system/system-summary-service.ts";

const systemConfigLayer = SystemConfigServiceLive;

const backgroundJobStatusLayer = BackgroundJobStatusServiceLive.pipe(Layer.provide(systemConfigLayer));

const systemSummaryLayer = SystemSummaryServiceLive.pipe(
  Layer.provide(Layer.mergeAll(systemConfigLayer, backgroundJobStatusLayer)),
);

const systemStatusLayer = SystemStatusServiceLive.pipe(Layer.provide(systemSummaryLayer));
const systemDashboardLayer = SystemDashboardServiceLive.pipe(Layer.provide(systemSummaryLayer));
const metricsLayer = MetricsServiceLive.pipe(Layer.provide(systemSummaryLayer));
const imageAssetLayer = ImageAssetServiceLive.pipe(Layer.provide(systemConfigLayer));

export const SystemFeatureLive = Layer.mergeAll(
  SystemBootstrapServiceLive,
  systemConfigLayer,
  backgroundJobStatusLayer,
  SystemConfigUpdateServiceLive,
  systemSummaryLayer,
  systemStatusLayer,
  systemDashboardLayer,
  metricsLayer,
  imageAssetLayer,
  QualityProfileServiceLive,
  ReleaseProfileServiceLive,
  SystemLogServiceLive,
);
