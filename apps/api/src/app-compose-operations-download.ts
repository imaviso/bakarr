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

type LayerRef<Out, Err, Req> = Layer.Layer<Out, Err, Req>;

export function makeOperationsDownloadLayer<ROut, E, RIn>(
  runtimeSupportLayer: LayerRef<ROut, E, RIn>,
) {
  const coordinatorsLayer = Layer.mergeAll(
    DownloadTriggerCoordinatorLive,
    UnmappedScanCoordinatorLive,
  );
  const operationsRuntimeLayer = Layer.mergeAll(runtimeSupportLayer, coordinatorsLayer);

  const torrentClientLayer = TorrentClientServiceLive.pipe(
    Layer.provideMerge(operationsRuntimeLayer),
  );
  const downloadRuntimeLayer = Layer.mergeAll(operationsRuntimeLayer, torrentClientLayer);
  const downloadReconciliationLayer = DownloadReconciliationServiceLive.pipe(
    Layer.provideMerge(downloadRuntimeLayer),
  );
  const runtimeWithReconciliationLayer = Layer.mergeAll(
    downloadRuntimeLayer,
    downloadReconciliationLayer,
  );
  const downloadTorrentLifecycleLayer = DownloadTorrentLifecycleServiceLive.pipe(
    Layer.provideMerge(runtimeWithReconciliationLayer),
  );
  const runtimeWithLifecycleLayer = Layer.mergeAll(
    runtimeWithReconciliationLayer,
    downloadTorrentLifecycleLayer,
  );
  const downloadProgressSupportLayer = DownloadProgressSupportLive.pipe(
    Layer.provideMerge(runtimeWithLifecycleLayer),
  );
  const runtimeWithProgressLayer = Layer.mergeAll(
    runtimeWithLifecycleLayer,
    downloadProgressSupportLayer,
  );
  const downloadTriggerLayer = DownloadTriggerServiceLive.pipe(
    Layer.provideMerge(runtimeWithProgressLayer),
  );
  const catalogDownloadReadLayer = CatalogDownloadReadServiceLive.pipe(
    Layer.provideMerge(runtimeSupportLayer),
  );
  const commandDependenciesLayer = Layer.mergeAll(
    runtimeSupportLayer,
    downloadReconciliationLayer,
    downloadTorrentLifecycleLayer,
    downloadProgressSupportLayer,
  );
  const catalogDownloadCommandLayer = CatalogDownloadCommandServiceLive.pipe(
    Layer.provideMerge(commandDependenciesLayer),
  );
  const progressDependenciesLayer = Layer.mergeAll(
    runtimeSupportLayer,
    downloadReconciliationLayer,
    downloadTorrentLifecycleLayer,
    downloadProgressSupportLayer,
    downloadTriggerLayer,
    catalogDownloadReadLayer,
    catalogDownloadCommandLayer,
  );
  const operationsProgressLayer = ProgressLive.pipe(Layer.provideMerge(progressDependenciesLayer));
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
