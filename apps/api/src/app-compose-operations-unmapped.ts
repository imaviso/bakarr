import { Layer } from "effect";

import { UnmappedControlServiceLive } from "@/features/operations/unmapped-control-service.ts";
import { UnmappedImportServiceLive } from "@/features/operations/unmapped-orchestration-import.ts";
import { UnmappedScanServiceLive } from "@/features/operations/unmapped-scan-service.ts";
import { type AnyLayer, provideFrom, provideLayer } from "@/lib/layer-compose.ts";

interface OperationsUnmappedLayerInput {
  readonly operationsRuntimeLayer: AnyLayer;
  readonly runtimeSupportLayer: AnyLayer;
}

export function makeOperationsUnmappedLayer(input: OperationsUnmappedLayerInput) {
  const { operationsRuntimeLayer, runtimeSupportLayer } = input;
  const withRuntime = provideFrom(runtimeSupportLayer);

  const buildUnmappedSubgraphLayers = () => {
    const unmappedScanLayer = provideLayer(UnmappedScanServiceLive, operationsRuntimeLayer);
    const runtimeWithScanLayer = Layer.mergeAll(runtimeSupportLayer, unmappedScanLayer);
    const unmappedControlLayer = provideLayer(UnmappedControlServiceLive, runtimeWithScanLayer);
    const unmappedImportLayer = withRuntime(UnmappedImportServiceLive);

    const unmappedSubgraphLayer = Layer.mergeAll(
      unmappedScanLayer,
      unmappedControlLayer,
      unmappedImportLayer,
    );

    return {
      unmappedSubgraphLayer,
    } as const;
  };

  const unmappedLayers = buildUnmappedSubgraphLayers();

  return {
    unmappedSubgraphLayer: unmappedLayers.unmappedSubgraphLayer,
  } as const;
}
