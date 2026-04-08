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

export function makeOperationsDownloadLayer<ROut, E, RIn>(
  runtimeSupportLayer: Layer.Layer<ROut, E, RIn>,
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
  const downloadTorrentLifecycleLayer = DownloadTorrentLifecycleServiceLive.pipe(
    Layer.provideMerge(Layer.mergeAll(downloadRuntimeLayer, downloadReconciliationLayer)),
  );
  const downloadProgressSupportLayer = DownloadProgressSupportLive.pipe(
    Layer.provideMerge(Layer.mergeAll(downloadRuntimeLayer, downloadTorrentLifecycleLayer)),
  );
  const downloadTriggerLayer = DownloadTriggerServiceLive.pipe(
    Layer.provideMerge(Layer.mergeAll(downloadRuntimeLayer, downloadProgressSupportLayer)),
  );
  const catalogDownloadReadLayer = CatalogDownloadReadServiceLive.pipe(
    Layer.provideMerge(runtimeSupportLayer),
  );
  const catalogDownloadCommandLayer = CatalogDownloadCommandServiceLive.pipe(
    Layer.provideMerge(
      Layer.mergeAll(
        runtimeSupportLayer,
        downloadReconciliationLayer,
        downloadTorrentLifecycleLayer,
        downloadProgressSupportLayer,
      ),
    ),
  );
  const operationsProgressLayer = ProgressLive.pipe(
    Layer.provideMerge(
      Layer.mergeAll(
        runtimeSupportLayer,
        downloadReconciliationLayer,
        downloadTorrentLifecycleLayer,
        downloadProgressSupportLayer,
        downloadTriggerLayer,
        catalogDownloadReadLayer,
        catalogDownloadCommandLayer,
      ),
    ),
  );
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
