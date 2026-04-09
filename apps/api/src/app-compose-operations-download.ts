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
import { provideFrom, provideLayer } from "@/lib/layer-compose.ts";

export function makeOperationsDownloadLayer<RSOut, RSE, RSR>(
  runtimeSupportLayer: Layer.Layer<RSOut, RSE, RSR>,
) {
  const withRuntime = provideFrom(runtimeSupportLayer);
  const buildDownloadRuntimeLayers = () => {
    const operationsRuntimeLayer = Layer.mergeAll(
      runtimeSupportLayer,
      DownloadTriggerCoordinatorLive,
      UnmappedScanCoordinatorLive,
    );

    const withOperationsRuntime = provideFrom(operationsRuntimeLayer);

    const torrentClientLayer = withOperationsRuntime(TorrentClientServiceLive);
    const downloadRuntimeLayer = Layer.mergeAll(operationsRuntimeLayer, torrentClientLayer);

    const withDownloadRuntime = provideFrom(downloadRuntimeLayer);

    const downloadReconciliationLayer = withDownloadRuntime(DownloadReconciliationServiceLive);
    const downloadLifecycleRuntimeLayer = Layer.mergeAll(
      downloadRuntimeLayer,
      downloadReconciliationLayer,
    );
    const withDownloadLifecycleRuntime = provideFrom(downloadLifecycleRuntimeLayer);

    const downloadTorrentLifecycleLayer = withDownloadLifecycleRuntime(
      DownloadTorrentLifecycleServiceLive,
    );
    const downloadProgressRuntimeLayer = Layer.mergeAll(
      downloadLifecycleRuntimeLayer,
      downloadTorrentLifecycleLayer,
    );

    const withDownloadProgressRuntime = provideFrom(downloadProgressRuntimeLayer);

    const downloadProgressSupportLayer = withDownloadProgressRuntime(DownloadProgressSupportLive);
    const triggerRuntimeLayer = Layer.mergeAll(
      downloadProgressRuntimeLayer,
      downloadProgressSupportLayer,
    );

    const withTriggerRuntime = provideFrom(triggerRuntimeLayer);

    const downloadTriggerLayer = withTriggerRuntime(DownloadTriggerServiceLive);

    return {
      downloadProgressRuntimeLayer,
      downloadProgressSupportLayer,
      downloadReconciliationLayer,
      downloadRuntimeLayer,
      downloadTorrentLifecycleLayer,
      downloadTriggerLayer,
      operationsRuntimeLayer,
      torrentClientLayer,
      triggerRuntimeLayer,
    } as const;
  };

  const runtimeLayers = buildDownloadRuntimeLayers();
  const catalogDownloadReadLayer = withRuntime(CatalogDownloadReadServiceLive);

  const buildDownloadCommandLayers = () => {
    const commandDependenciesLayer = Layer.mergeAll(
      runtimeLayers.downloadProgressRuntimeLayer,
      runtimeLayers.downloadProgressSupportLayer,
    );
    const catalogDownloadCommandLayer = provideLayer(
      CatalogDownloadCommandServiceLive,
      commandDependenciesLayer,
    );

    const progressDependenciesLayer = Layer.mergeAll(
      runtimeLayers.triggerRuntimeLayer,
      runtimeLayers.downloadTriggerLayer,
      catalogDownloadReadLayer,
      catalogDownloadCommandLayer,
    );
    const operationsProgressLayer = provideLayer(ProgressLive, progressDependenciesLayer);

    return {
      catalogDownloadCommandLayer,
      operationsProgressLayer,
    } as const;
  };

  const commandLayers = buildDownloadCommandLayers();

  const downloadSubgraphLayer = Layer.mergeAll(
    runtimeLayers.torrentClientLayer,
    runtimeLayers.downloadReconciliationLayer,
    runtimeLayers.downloadTorrentLifecycleLayer,
    runtimeLayers.downloadProgressSupportLayer,
    runtimeLayers.downloadTriggerLayer,
    catalogDownloadReadLayer,
    commandLayers.catalogDownloadCommandLayer,
    commandLayers.operationsProgressLayer,
  );

  return {
    catalogDownloadReadLayer,
    downloadRuntimeLayer: runtimeLayers.downloadRuntimeLayer,
    downloadSubgraphLayer,
    operationsProgressLayer: commandLayers.operationsProgressLayer,
    operationsRuntimeLayer: runtimeLayers.operationsRuntimeLayer,
    torrentClientLayer: runtimeLayers.torrentClientLayer,
  } as const;
}
