import { Layer } from "effect";

import { CatalogDownloadCommandServiceLive } from "@/features/operations/catalog-download-command-service.ts";
import { CatalogDownloadReadServiceLive } from "@/features/operations/catalog-download-read-service.ts";
import { DownloadProgressSupportLive } from "@/features/operations/download-progress-support.ts";
import { DownloadReconciliationServiceLive } from "@/features/operations/download-reconciliation-service.ts";
import { DownloadTorrentLifecycleServiceLive } from "@/features/operations/download-torrent-lifecycle-service.ts";
import { DownloadTriggerServiceLive } from "@/features/operations/download-trigger-service.ts";
import { ProgressLive } from "@/features/operations/operations-progress-service.ts";
import {
  DownloadTriggerCoordinatorLive,
  UnmappedScanCoordinatorLive,
} from "@/features/operations/runtime-support.ts";
import { TorrentClientServiceLive } from "@/features/operations/torrent-client-service.ts";

export function makeOperationsDownloadLayer<RSOut, RSE, RSR>(
  runtimeSupportLayer: Layer.Layer<RSOut, RSE, RSR>,
) {
  const operationsRuntimeLayer = Layer.mergeAll(
    runtimeSupportLayer,
    DownloadTriggerCoordinatorLive,
    UnmappedScanCoordinatorLive,
  );

  const torrentClientLayer = TorrentClientServiceLive.pipe(Layer.provide(operationsRuntimeLayer));
  const downloadRuntimeLayer = Layer.mergeAll(operationsRuntimeLayer, torrentClientLayer);

  const downloadReconciliationLayer = DownloadReconciliationServiceLive.pipe(
    Layer.provide(downloadRuntimeLayer),
  );
  const downloadLifecycleRuntimeLayer = Layer.mergeAll(
    downloadRuntimeLayer,
    downloadReconciliationLayer,
  );

  const downloadTorrentLifecycleLayer = DownloadTorrentLifecycleServiceLive.pipe(
    Layer.provide(downloadLifecycleRuntimeLayer),
  );
  const downloadProgressRuntimeLayer = Layer.mergeAll(
    downloadLifecycleRuntimeLayer,
    downloadTorrentLifecycleLayer,
  );

  const downloadProgressSupportLayer = DownloadProgressSupportLive.pipe(
    Layer.provide(downloadProgressRuntimeLayer),
  );
  const triggerRuntimeLayer = Layer.mergeAll(
    downloadProgressRuntimeLayer,
    downloadProgressSupportLayer,
  );

  const downloadTriggerLayer = DownloadTriggerServiceLive.pipe(Layer.provide(triggerRuntimeLayer));
  const catalogDownloadReadLayer = CatalogDownloadReadServiceLive.pipe(
    Layer.provide(runtimeSupportLayer),
  );
  const commandDependenciesLayer = Layer.mergeAll(
    downloadProgressRuntimeLayer,
    downloadProgressSupportLayer,
  );
  const catalogDownloadCommandLayer = CatalogDownloadCommandServiceLive.pipe(
    Layer.provide(commandDependenciesLayer),
  );

  const progressDependenciesLayer = Layer.mergeAll(
    triggerRuntimeLayer,
    downloadTriggerLayer,
    catalogDownloadReadLayer,
    catalogDownloadCommandLayer,
  );
  const operationsProgressLayer = ProgressLive.pipe(Layer.provide(progressDependenciesLayer));

  const downloadSubgraphLayer = Layer.mergeAll(
    torrentClientLayer,
    downloadReconciliationLayer,
    downloadTorrentLifecycleLayer,
    downloadProgressSupportLayer,
    downloadTriggerLayer,
    catalogDownloadReadLayer,
    catalogDownloadCommandLayer,
    operationsProgressLayer,
  );

  return {
    catalogDownloadReadLayer,
    downloadRuntimeLayer,
    downloadSubgraphLayer,
    operationsProgressLayer,
    operationsRuntimeLayer,
    torrentClientLayer,
  } as const;
}
