import { Layer } from "effect";

import { makeOperationsCatalogLayer } from "@/app-compose-operations-catalog.ts";
import { makeOperationsDownloadLayer } from "@/app-compose-operations-download.ts";
import { makeOperationsSearchLayer } from "@/app-compose-operations-search.ts";
import { makeOperationsUnmappedLayer } from "@/app-compose-operations-unmapped.ts";
import { type AnyLayer } from "@/lib/layer-compose.ts";

export function makeOperationsAppLayers(runtimeSupportLayer: AnyLayer) {
  const buildOperationsSubgraphLayers = () => {
    const downloadLayers = makeOperationsDownloadLayer(runtimeSupportLayer);
    const searchLayers = makeOperationsSearchLayer({
      downloadRuntimeLayer: downloadLayers.downloadRuntimeLayer,
      operationsProgressLayer: downloadLayers.operationsProgressLayer,
      runtimeSupportLayer,
    });
    const unmappedLayers = makeOperationsUnmappedLayer({
      operationsRuntimeLayer: downloadLayers.operationsRuntimeLayer,
      runtimeSupportLayer,
    });
    const catalogLayers = makeOperationsCatalogLayer({
      operationsProgressLayer: downloadLayers.operationsProgressLayer,
      runtimeSupportLayer,
    });

    const operationsSubgraphLayer = Layer.mergeAll(
      downloadLayers.downloadSubgraphLayer,
      searchLayers.searchSubgraphLayer,
      unmappedLayers.unmappedSubgraphLayer,
      catalogLayers.catalogSubgraphLayer,
    );

    return {
      downloadLayers,
      operationsSubgraphLayer,
    } as const;
  };

  const operationsLayers = buildOperationsSubgraphLayers();

  return {
    catalogDownloadReadLayer: operationsLayers.downloadLayers.catalogDownloadReadLayer,
    operationsLayer: operationsLayers.operationsSubgraphLayer,
    operationsProgressLayer: operationsLayers.downloadLayers.operationsProgressLayer,
    torrentClientLayer: operationsLayers.downloadLayers.torrentClientLayer,
  } as const;
}
