import { Layer } from "effect";

import { UnmappedControlServiceLive } from "@/features/operations/unmapped-control-service.ts";
import { UnmappedImportServiceLive } from "@/features/operations/unmapped-orchestration-import.ts";
import { UnmappedScanServiceLive } from "@/features/operations/unmapped-scan-service.ts";

type LayerRef<Out, Err, Req> = Layer.Layer<Out, Err, Req>;

export function makeOperationsUnmappedLayer<RSOut, RSE, RSR, OOut, OE, OR>(input: {
  readonly operationsRuntimeLayer: LayerRef<OOut, OE, OR>;
  readonly runtimeSupportLayer: LayerRef<RSOut, RSE, RSR>;
}) {
  const unmappedScanLayer = UnmappedScanServiceLive.pipe(
    Layer.provideMerge(input.operationsRuntimeLayer),
  );
  const unmappedControlLayer = UnmappedControlServiceLive.pipe(
    Layer.provideMerge(Layer.mergeAll(input.runtimeSupportLayer, unmappedScanLayer)),
  );
  const unmappedImportLayer = UnmappedImportServiceLive.pipe(
    Layer.provideMerge(input.runtimeSupportLayer),
  );
  const unmappedSubgraphLayer = Layer.mergeAll(
    unmappedScanLayer,
    unmappedControlLayer,
    unmappedImportLayer,
  );

  return {
    unmappedSubgraphLayer,
  } as const;
}
