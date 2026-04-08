import { Layer } from "effect";

import { makeOperationsCatalogLayer } from "@/app-compose-operations-catalog.ts";
import { makeOperationsDownloadLayer } from "@/app-compose-operations-download.ts";
import { makeOperationsSearchLayer } from "@/app-compose-operations-search.ts";
import { makeOperationsUnmappedLayer } from "@/app-compose-operations-unmapped.ts";

export function makeOperationsAppLayers<ROut, E, RIn>(
  runtimeSupportLayer: Layer.Layer<ROut, E, RIn>,
) {
  const {
    catalogDownloadReadLayer,
    downloadRuntimeLayer,
    downloadSubgraphLayer,
    operationsProgressLayer,
    operationsRuntimeLayer,
    torrentClientLayer,
  } = makeOperationsDownloadLayer(runtimeSupportLayer);
  const { searchSubgraphLayer } = makeOperationsSearchLayer({
    downloadRuntimeLayer,
    operationsProgressLayer,
    runtimeSupportLayer,
  });
  const { unmappedSubgraphLayer } = makeOperationsUnmappedLayer({
    operationsRuntimeLayer,
    runtimeSupportLayer,
  });
  const { catalogSubgraphLayer } = makeOperationsCatalogLayer({
    operationsProgressLayer,
    runtimeSupportLayer,
  });

  const operationsLayer = Layer.mergeAll(
    downloadSubgraphLayer,
    searchSubgraphLayer,
    unmappedSubgraphLayer,
    catalogSubgraphLayer,
  );

  return {
    catalogDownloadReadLayer,
    operationsLayer,
    operationsProgressLayer,
    torrentClientLayer,
  } as const;
}
