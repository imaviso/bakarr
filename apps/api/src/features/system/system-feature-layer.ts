import { Layer } from "effect";

import { BackgroundJobStatusServiceLive } from "@/features/system/background-job-status-service.ts";
import { ImageAssetServiceLive } from "@/features/system/image-asset-service.ts";
import { MetricsServiceLive } from "@/features/system/metrics-service.ts";
import { QualityProfileServiceLive } from "@/features/system/quality-profile-service.ts";
import { ReleaseProfileServiceLive } from "@/features/system/release-profile-service.ts";
import type { RuntimeConfigSnapshotService } from "@/features/system/runtime-config-snapshot-service.ts";
import { SystemBootstrapServiceLive } from "@/features/system/system-bootstrap-service.ts";
import { SystemConfigUpdateServiceLive } from "@/features/system/system-config-update-service.ts";
import type { SystemConfigService } from "@/features/system/system-config-service.ts";
import { SystemLogServiceLive } from "@/features/system/system-log-service.ts";
import { SystemReadServiceLive } from "@/features/system/system-read-service.ts";

export function makeSystemFeatureLive(input: {
  readonly runtimeConfigSnapshotLayer: Layer.Layer<RuntimeConfigSnapshotService, unknown, never>;
  readonly systemConfigLayer: Layer.Layer<SystemConfigService, unknown, never>;
}) {
  const { runtimeConfigSnapshotLayer, systemConfigLayer } = input;

  const systemConfigUpdateLayer = SystemConfigUpdateServiceLive.pipe(
    Layer.provide(Layer.mergeAll(systemConfigLayer, runtimeConfigSnapshotLayer)),
  );

  const backgroundJobStatusLayer = BackgroundJobStatusServiceLive.pipe(
    Layer.provide(runtimeConfigSnapshotLayer),
  );

  const systemReadLayer = SystemReadServiceLive.pipe(
    Layer.provide(Layer.mergeAll(runtimeConfigSnapshotLayer, backgroundJobStatusLayer)),
  );

  const metricsLayer = MetricsServiceLive.pipe(Layer.provide(systemReadLayer));
  const imageAssetLayer = ImageAssetServiceLive.pipe(Layer.provide(systemConfigLayer));

  return Layer.mergeAll(
    SystemBootstrapServiceLive,
    backgroundJobStatusLayer,
    systemConfigUpdateLayer,
    systemReadLayer,
    metricsLayer,
    imageAssetLayer,
    QualityProfileServiceLive,
    ReleaseProfileServiceLive,
    SystemLogServiceLive,
  );
}
