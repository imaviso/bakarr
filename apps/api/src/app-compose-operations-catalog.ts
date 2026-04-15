import { Layer } from "effect";

import { CatalogLibraryReadServiceLive } from "@/features/operations/catalog-library-read-service.ts";
import { CatalogLibraryScanServiceLive } from "@/features/operations/catalog-library-scan-service.ts";
import { CatalogLibraryWriteServiceLive } from "@/features/operations/catalog-library-write-service.ts";
import { CatalogRssServiceLive } from "@/features/operations/catalog-rss-service.ts";
import { ImportPathScanServiceLive } from "@/features/operations/import-path-scan-service.ts";
import { LibraryRootsQueryServiceLive } from "@/features/operations/library-roots-query-service.ts";
import { OperationsTaskServiceLive } from "@/features/operations/operations-task-service.ts";

interface OperationsCatalogLayerInput<OPOut, OPE, OPR, RSOut, RSE, RSR> {
  readonly operationsProgressLayer: Layer.Layer<OPOut, OPE, OPR>;
  readonly runtimeSupportLayer: Layer.Layer<RSOut, RSE, RSR>;
}

export function makeOperationsCatalogLayer<OPOut, OPE, OPR, RSOut, RSE, RSR>(
  input: OperationsCatalogLayerInput<OPOut, OPE, OPR, RSOut, RSE, RSR>,
) {
  const { operationsProgressLayer, runtimeSupportLayer } = input;
  const runtimeWithProgressLayer = Layer.mergeAll(runtimeSupportLayer, operationsProgressLayer);

  const catalogLibraryReadLayer = CatalogLibraryReadServiceLive.pipe(
    Layer.provide(runtimeSupportLayer),
  );
  const operationsTaskLayer = OperationsTaskServiceLive.pipe(Layer.provide(runtimeSupportLayer));
  const runtimeWithOperationsTaskLayer = Layer.mergeAll(runtimeSupportLayer, operationsTaskLayer);
  const catalogLibraryWriteLayer = CatalogLibraryWriteServiceLive.pipe(
    Layer.provide(runtimeWithOperationsTaskLayer),
  );
  const catalogLibraryScanLayer = CatalogLibraryScanServiceLive.pipe(
    Layer.provide(runtimeWithProgressLayer),
  );
  const importPathScanLayer = ImportPathScanServiceLive.pipe(Layer.provide(runtimeSupportLayer));
  const catalogRssLayer = CatalogRssServiceLive.pipe(Layer.provide(runtimeSupportLayer));
  const libraryRootsQueryLayer = LibraryRootsQueryServiceLive.pipe(
    Layer.provide(runtimeSupportLayer),
  );

  const catalogSubgraphLayer = Layer.mergeAll(
    catalogLibraryReadLayer,
    operationsTaskLayer,
    catalogLibraryWriteLayer,
    catalogLibraryScanLayer,
    importPathScanLayer,
    catalogRssLayer,
    libraryRootsQueryLayer,
  );

  return {
    catalogSubgraphLayer,
  } as const;
}
