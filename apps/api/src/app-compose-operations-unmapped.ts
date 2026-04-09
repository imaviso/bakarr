import { Layer } from "effect";

import { UnmappedControlServiceLive } from "@/features/operations/unmapped-control-service.ts";
import { UnmappedImportServiceLive } from "@/features/operations/unmapped-orchestration-import.ts";
import { UnmappedScanServiceLive } from "@/features/operations/unmapped-scan-service.ts";
import { provideFrom, provideLayer } from "@/lib/layer-compose.ts";

interface OperationsUnmappedLayerInput<ORTOut, ORTE, ORTR, RSOut, RSE, RSR> {
  readonly operationsRuntimeLayer: Layer.Layer<ORTOut, ORTE, ORTR>;
  readonly runtimeSupportLayer: Layer.Layer<RSOut, RSE, RSR>;
}

export function makeOperationsUnmappedLayer<ORTOut, ORTE, ORTR, RSOut, RSE, RSR>(
  input: OperationsUnmappedLayerInput<ORTOut, ORTE, ORTR, RSOut, RSE, RSR>,
) {
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
