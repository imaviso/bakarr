import { Layer } from "effect";

import { CatalogLibraryReadServiceLive } from "@/features/operations/catalog-library-read-service.ts";
import { CatalogLibraryScanServiceLive } from "@/features/operations/catalog-library-scan-service.ts";
import { CatalogLibraryWriteServiceLive } from "@/features/operations/catalog-library-write-service.ts";
import { CatalogRssServiceLive } from "@/features/operations/catalog-rss-service.ts";
import { ImportPathScanServiceLive } from "@/features/operations/import-path-scan-service.ts";
import { LibraryRootsQueryServiceLive } from "@/features/operations/library-roots-query-service.ts";

type LayerRef<Out, Err, Req> = Layer.Layer<Out, Err, Req>;

export function makeOperationsCatalogLayer<RSOut, RSE, RSR, POut, PE, PR>(input: {
  readonly operationsProgressLayer: LayerRef<POut, PE, PR>;
  readonly runtimeSupportLayer: LayerRef<RSOut, RSE, RSR>;
}) {
  const catalogLibraryReadLayer = CatalogLibraryReadServiceLive.pipe(
    Layer.provideMerge(input.runtimeSupportLayer),
  );
  const catalogLibraryWriteLayer = CatalogLibraryWriteServiceLive.pipe(
    Layer.provideMerge(input.runtimeSupportLayer),
  );
  const catalogLibraryScanLayer = CatalogLibraryScanServiceLive.pipe(
    Layer.provideMerge(Layer.mergeAll(input.runtimeSupportLayer, input.operationsProgressLayer)),
  );
  const importPathScanLayer = ImportPathScanServiceLive.pipe(
    Layer.provideMerge(input.runtimeSupportLayer),
  );
  const catalogRssLayer = CatalogRssServiceLive.pipe(Layer.provideMerge(input.runtimeSupportLayer));
  const libraryRootsQueryLayer = LibraryRootsQueryServiceLive.pipe(
    Layer.provideMerge(input.runtimeSupportLayer),
  );
  const catalogSubgraphLayer = Layer.mergeAll(
    catalogLibraryReadLayer,
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
