import { Layer } from "effect";

import { BackgroundJobStatusServiceLive } from "./background-job-status-service.ts";
import { ImageAssetServiceLive } from "./image-asset-service.ts";
import { MetricsServiceLive } from "./metrics-service.ts";
import { QualityProfileServiceLive } from "./quality-profile-service.ts";
import { ReleaseProfileServiceLive } from "./release-profile-service.ts";
import { SystemBootstrapServiceLive } from "./system-bootstrap-service.ts";
import { SystemConfigUpdateServiceLive } from "./system-config-update-service.ts";
import { SystemConfigServiceLive } from "./system-config-service.ts";
import { SystemDashboardServiceLive } from "./system-dashboard-service.ts";
import { SystemLogServiceLive } from "./system-log-service.ts";
import { SystemStatusServiceLive } from "./system-status-service.ts";

export function makeSystemFeatureLayer<
  APlatform,
  EPlatform,
  RPlatform,
  AOperations,
  EOperations,
  ROperations,
  ABackground,
  EBackground,
  RBackground,
>(
  platformLayer: Layer.Layer<APlatform, EPlatform, RPlatform>,
  operationsLayer: Layer.Layer<AOperations, EOperations, ROperations>,
  backgroundControllerLayer: Layer.Layer<ABackground, EBackground, RBackground>,
) {
  const providePlatform = Layer.provideMerge(platformLayer);
  const systemConfigLayer = SystemConfigServiceLive.pipe(providePlatform);
  const platformAndConfigLayer = Layer.mergeAll(platformLayer, systemConfigLayer);
  const backgroundJobStatusLayer = BackgroundJobStatusServiceLive.pipe(
    Layer.provideMerge(platformAndConfigLayer),
  );
  const systemBootstrapLayer = SystemBootstrapServiceLive.pipe(providePlatform);
  const qualityProfileServiceLayer = QualityProfileServiceLive.pipe(providePlatform);
  const releaseProfileServiceLayer = ReleaseProfileServiceLive.pipe(providePlatform);
  const systemLogServiceLayer = SystemLogServiceLive.pipe(providePlatform);
  const platformAndBackgroundControllerLayer = Layer.mergeAll(
    platformLayer,
    backgroundControllerLayer,
  );
  const systemConfigUpdateLayer = SystemConfigUpdateServiceLive.pipe(
    Layer.provideMerge(platformAndBackgroundControllerLayer),
  );
  const platformConfigAndBackgroundStatusLayer = Layer.mergeAll(
    platformAndConfigLayer,
    backgroundJobStatusLayer,
  );
  const systemStatusLayer = SystemStatusServiceLive.pipe(
    Layer.provideMerge(platformConfigAndBackgroundStatusLayer),
  );
  const systemDashboardLayer = SystemDashboardServiceLive.pipe(
    Layer.provideMerge(platformConfigAndBackgroundStatusLayer),
  );
  const platformOperationsAndStatusLayer = Layer.mergeAll(
    platformLayer,
    operationsLayer,
    systemStatusLayer,
  );
  const metricsLayer = MetricsServiceLive.pipe(
    Layer.provideMerge(platformOperationsAndStatusLayer),
  );
  const imageAssetLayer = ImageAssetServiceLive.pipe(Layer.provideMerge(platformAndConfigLayer));

  return Layer.mergeAll(
    systemBootstrapLayer,
    systemConfigLayer,
    backgroundJobStatusLayer,
    systemConfigUpdateLayer,
    systemStatusLayer,
    systemDashboardLayer,
    qualityProfileServiceLayer,
    releaseProfileServiceLayer,
    systemLogServiceLayer,
    metricsLayer,
    imageAssetLayer,
  );
}
