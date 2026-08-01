import { CommandExecutor } from "@effect/platform";
import { Layer } from "effect";

import {
  makeAppExternalClientLayer,
  type AppExternalClientLayerOptions,
} from "@/app/platform/external-clients-layer.ts";
import {
  makeAppPlatformCoreRuntimeLayer,
  type AppPlatformRuntimeOptions,
} from "@/app/platform/runtime-core.ts";
import { PureDbLeaves } from "@/app/pure-db-leaves.ts";
import type { AppConfigOverrides, BootstrapConfigOverrides } from "@/config/schema.ts";
import type { ObservabilityConfigOverrides } from "@/config/observability.ts";
import { BackgroundWorkerControllerLive } from "@/background/controller-core.ts";
import { BackgroundTaskRunnerLive } from "@/background/task-runner.ts";
import { MediaFeatureLayer } from "@/features/media/layer.ts";
import { AuthFeatureLayer } from "@/features/auth/layer.ts";
import { OperationsFeatureLayer } from "@/features/operations/layer.ts";
import { SystemFeatureLayer } from "@/features/system/layer.ts";
import { OperationsProgressLive } from "@/features/operations/tasks/operations-progress-service.ts";
import { TorrentClientServiceLive } from "@/features/operations/qbittorrent/torrent-client-service.ts";
import { DiskSpaceInspectorLive } from "@/features/system/disk-space.ts";
import { RuntimeConfigSnapshotServiceLive } from "@/features/system/runtime-config-snapshot-service.ts";
import { MediaProbeLive } from "@/infra/media/probe.ts";

export type ApiLifecycleOptions = AppPlatformRuntimeOptions &
  AppExternalClientLayerOptions & {
    readonly commandExecutorLayer?: Layer.Layer<CommandExecutor.CommandExecutor>;
  };

/**
 * Application layer assembly.
 *
 * Flat structure, assembled once:
 *
 * 1. `platformRuntimeLayer` — platform core (config, db, logging, telemetry,
 *    event bus, crypto) + optional command executor override.
 * 2. `runtimeConfigSnapshotLayer` — stateful singleton (config cache Ref +
 *    load semaphore). Built before external clients because provider clients
 *    read runtime config at construction; merged into `runtimeSupportLayer`.
 * 3. `runtimeSupportLayer` — everything feature services may legitimately
 *    `yield*` without embedding: platform/config tags, external clients,
 *    MediaProbe/DiskSpaceInspector + the runtime config snapshot.
 * 4. `pureDbLeaves` — the single production provision of every repository
 *    (ADR-0001): each is a self-contained `.Default` built once here.
 * 5. Stateful singleton staircase (below) — the one place that cannot be plain
 *    `mergeAll(Default, ...)` entries. Each owns cross-feature mutable
 *    coordination state (coalesced progress publishers with semaphores/Refs,
 *    torrent client folding, background worker lifecycle) and some depend on
 *    sibling singletons at construction time, so wrappers fix the providing
 *    environment explicitly. These wrapped consts are the canonical instances:
 *    feature services never embed or merge the raw `.Default` of these five,
 *    so the layer memo map builds each exactly once.
 * 6. Feature roots (features/<x>/layer.ts) are declarative mergeAll lists of
 *    self-contained service Defaults; ONE `Layer.provide` here covers their
 *    residual context requirements (clients, config/platform tags + the
 *    singletons above). Feature graphs never hand-wire each other.
 */
export function makeApiLifecycleLayers(
  overrides: AppConfigOverrides & BootstrapConfigOverrides & ObservabilityConfigOverrides = {},
  options?: ApiLifecycleOptions,
) {
  const platformCoreLayer = makeAppPlatformCoreRuntimeLayer(overrides, options);
  const platformRuntimeLayer = options?.commandExecutorLayer
    ? Layer.mergeAll(platformCoreLayer, options.commandExecutorLayer)
    : platformCoreLayer;

  const runtimeConfigSnapshotLayer = RuntimeConfigSnapshotServiceLive.pipe(
    Layer.provide(platformRuntimeLayer),
  );
  const configRuntimeLayer = Layer.mergeAll(platformRuntimeLayer, runtimeConfigSnapshotLayer);

  const externalClientLayer = makeAppExternalClientLayer(options).pipe(
    Layer.provide(configRuntimeLayer),
  );

  const platformExternalLayer = Layer.mergeAll(platformRuntimeLayer, externalClientLayer);
  const infrastructureLayer = Layer.mergeAll(MediaProbeLive, DiskSpaceInspectorLive).pipe(
    Layer.provide(platformExternalLayer),
  );
  const runtimeSupportLayer = Layer.mergeAll(
    platformExternalLayer,
    infrastructureLayer,
    runtimeConfigSnapshotLayer,
  );

  const pureDbLeaves = PureDbLeaves.pipe(Layer.provide(runtimeSupportLayer));

  // --- Stateful singleton staircase (see header comment, point 5) ---
  const operationsProgressLayer = OperationsProgressLive.pipe(Layer.provide(runtimeSupportLayer));
  const torrentClientLayer = TorrentClientServiceLive.pipe(Layer.provide(runtimeSupportLayer));
  // Task-runner transitively embeds services that yield OperationsProgress +
  // TorrentClientService (e.g. sync -> reconciliation), so both must be visible
  // at construction time.
  const backgroundTaskRunnerLayer = BackgroundTaskRunnerLive.pipe(
    Layer.provide(Layer.mergeAll(runtimeSupportLayer, operationsProgressLayer, torrentClientLayer)),
  );
  const backgroundControllerLayer = BackgroundWorkerControllerLive.pipe(
    Layer.provide(
      Layer.mergeAll(
        runtimeSupportLayer,
        operationsProgressLayer,
        torrentClientLayer,
        backgroundTaskRunnerLayer,
      ),
    ),
  );

  const appSupportLayer = Layer.mergeAll(
    runtimeSupportLayer,
    pureDbLeaves,
    operationsProgressLayer,
    torrentClientLayer,
    backgroundTaskRunnerLayer,
    backgroundControllerLayer,
  );

  const featureGraphLayer = Layer.mergeAll(
    AuthFeatureLayer,
    MediaFeatureLayer,
    OperationsFeatureLayer,
    SystemFeatureLayer,
  ).pipe(Layer.provide(appSupportLayer));

  const appLayer = Layer.mergeAll(appSupportLayer, featureGraphLayer);

  return {
    appLayer,
  } as const;
}
