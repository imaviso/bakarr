import { Layer } from "effect";

import { BackgroundJobStatusServiceLive } from "@/features/system/background-job-status-service.ts";
import { ImageAssetServiceLive } from "@/features/system/image-asset-service.ts";
import { QualityProfileServiceLive } from "@/features/system/quality-profile-service.ts";
import { ReleaseProfileServiceLive } from "@/features/system/release-profile-service.ts";
import { SystemBootstrapServiceLive } from "@/features/system/system-bootstrap-service.ts";
import { SystemConfigServiceLive } from "@/features/system/system-config-service.ts";
import { SystemConfigUpdateServiceLive } from "@/features/system/system-config-update-service.ts";
import { SystemEventsServiceLive } from "@/features/system/system-events-service.ts";
import { SystemLogServiceLive } from "@/features/system/system-log-service.ts";
import { SystemReadServiceLive } from "@/features/system/system-read-service.ts";
import { SystemRuntimeMetricsServiceLive } from "@/features/system/system-runtime-metrics-service.ts";

/**
 * System feature root.
 *
 * Declarative merge of self-contained `Effect.Service` Defaults: each service
 * declares its domain dependencies in its own `dependencies:` array, so no
 * per-service `Layer.provide` chains live here. Residual context requirements
 * (AppConfig, AppRuntime, DiskSpaceInspector, BackgroundWorkerMonitor,
 * RuntimeLogLevelState, EventBus, BackgroundWorkerController, OperationsProgress
 * + RuntimeConfigSnapshotService) are covered once by the lifecycle layer's
 * single `Layer.provide` over the merged feature graph — see
 * app/lifecycle-layers.ts.
 *
 * Leaf repositories (SystemConfigRepository, QualityProfileRepository, ...) are
 * NOT re-provided here: each lives exactly once in app/pure-db-leaves.ts per
 * ADR-0001 (services also embed the same canonical `.Default` objects, so the
 * layer memo map shares that single provision).
 */
export const SystemFeatureLayer = Layer.mergeAll(
  BackgroundJobStatusServiceLive,
  ImageAssetServiceLive,
  QualityProfileServiceLive,
  ReleaseProfileServiceLive,
  SystemBootstrapServiceLive,
  SystemConfigServiceLive,
  SystemConfigUpdateServiceLive,
  SystemEventsServiceLive,
  SystemLogServiceLive,
  SystemReadServiceLive,
  SystemRuntimeMetricsServiceLive,
);
