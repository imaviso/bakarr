import { Layer } from "effect";

import { makeOperationsCatalogLayer } from "@/app/compose/operations/catalog.ts";
import { makeOperationsDownloadLayer } from "@/app/compose/operations/download.ts";
import { makeOperationsSearchLayer } from "@/app/compose/operations/search.ts";
import { makeOperationsUnmappedLayer } from "@/app/compose/operations/unmapped.ts";

type LayerOf<Out, Error = never, Input = never> = Layer.Layer<Out, Error, Input>;

export function makeOperationsAppLayers<RSOut, RSE, RSR, OTOut, OTE>(
  runtimeSupportLayer: LayerOf<RSOut, RSE, RSR>,
  operationsTaskLayer: LayerOf<OTOut, OTE>,
) {
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
    operationsTaskLayer,
    runtimeSupportLayer,
  });

  const operationsLayer = Layer.mergeAll(
    downloadLayers.downloadSubgraphLayer,
    searchLayers.searchSubgraphLayer,
    unmappedLayers.unmappedSubgraphLayer,
    catalogLayers.catalogSubgraphLayer,
  );

  return {
    catalogDownloadReadLayer: downloadLayers.catalogDownloadReadLayer,
    operationsLayer,
    operationsProgressLayer: downloadLayers.operationsProgressLayer,
    torrentClientLayer: downloadLayers.torrentClientLayer,
  } as const;
}
