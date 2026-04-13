import { Layer } from "effect";

import { UnmappedControlServiceLive } from "@/features/operations/unmapped-control-service.ts";
import { UnmappedImportServiceLive } from "@/features/operations/unmapped-orchestration-import.ts";
import { UnmappedScanServiceLive } from "@/features/operations/unmapped-scan-service.ts";

interface OperationsUnmappedLayerInput<ORTOut, ORTE, ORTR, RSOut, RSE, RSR> {
  readonly operationsRuntimeLayer: Layer.Layer<ORTOut, ORTE, ORTR>;
  readonly runtimeSupportLayer: Layer.Layer<RSOut, RSE, RSR>;
}

export function makeOperationsUnmappedLayer<ORTOut, ORTE, ORTR, RSOut, RSE, RSR>(
  input: OperationsUnmappedLayerInput<ORTOut, ORTE, ORTR, RSOut, RSE, RSR>,
) {
  const { operationsRuntimeLayer, runtimeSupportLayer } = input;
  const unmappedScanLayer = UnmappedScanServiceLive.pipe(Layer.provide(operationsRuntimeLayer));
  const runtimeWithScanLayer = Layer.mergeAll(runtimeSupportLayer, unmappedScanLayer);
  const unmappedControlLayer = UnmappedControlServiceLive.pipe(Layer.provide(runtimeWithScanLayer));
  const unmappedImportLayer = UnmappedImportServiceLive.pipe(Layer.provide(runtimeSupportLayer));
  const unmappedSubgraphLayer = Layer.mergeAll(
    unmappedScanLayer,
    unmappedControlLayer,
    unmappedImportLayer,
  );

  return {
    unmappedSubgraphLayer,
  } as const;
}
