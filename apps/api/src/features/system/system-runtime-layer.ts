import { Layer } from "effect";

import { QualityProfileServiceLive } from "./quality-profile-service.ts";
import { ReleaseProfileServiceLive } from "./release-profile-service.ts";
import { SystemBootstrapServiceLive } from "./system-bootstrap-service.ts";
import { SystemConfigServiceLive } from "./system-config-service.ts";
import { SystemDashboardServiceLive } from "./system-dashboard-service.ts";
import { SystemLogServiceLive } from "./system-log-service.ts";
import { SystemStatusServiceLive } from "./system-status-service.ts";

export function makeSystemRuntimeLayers<Out, Err, In, ControllerOut, ControllerErr, ControllerIn>(
  platformLayer: Layer.Layer<Out, Err, In>,
  controllerLayer: Layer.Layer<ControllerOut, ControllerErr, ControllerIn>,
) {
  const systemBootstrapLayer = SystemBootstrapServiceLive.pipe(Layer.provide(platformLayer));
  const qualityProfileServiceLayer = QualityProfileServiceLive.pipe(Layer.provide(platformLayer));
  const releaseProfileServiceLayer = ReleaseProfileServiceLive.pipe(Layer.provide(platformLayer));
  const systemLogServiceLayer = SystemLogServiceLive.pipe(Layer.provide(platformLayer));
  const systemConfigServiceLayer = SystemConfigServiceLive.pipe(
    Layer.provide(Layer.mergeAll(platformLayer, controllerLayer)),
  );
  const systemStatusServiceLayer = SystemStatusServiceLive.pipe(
    Layer.provide(Layer.mergeAll(platformLayer, systemConfigServiceLayer)),
  );
  const systemDashboardServiceLayer = SystemDashboardServiceLive.pipe(
    Layer.provide(Layer.mergeAll(platformLayer, systemConfigServiceLayer)),
  );

  const systemLayer = Layer.mergeAll(
    systemBootstrapLayer,
    systemConfigServiceLayer,
    systemStatusServiceLayer,
    systemDashboardServiceLayer,
    qualityProfileServiceLayer,
    releaseProfileServiceLayer,
    systemLogServiceLayer,
  );

  return {
    systemConfigLayer: systemConfigServiceLayer,
    systemLayer,
    systemStatusLayer: systemStatusServiceLayer,
  };
}
