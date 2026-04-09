import { Layer } from "effect";

import { CatalogLibraryReadServiceLive } from "@/features/operations/catalog-library-read-service.ts";
import { CatalogLibraryScanServiceLive } from "@/features/operations/catalog-library-scan-service.ts";
import { CatalogLibraryWriteServiceLive } from "@/features/operations/catalog-library-write-service.ts";
import { CatalogRssServiceLive } from "@/features/operations/catalog-rss-service.ts";
import { ImportPathScanServiceLive } from "@/features/operations/import-path-scan-service.ts";
import { LibraryRootsQueryServiceLive } from "@/features/operations/library-roots-query-service.ts";
import { type AnyLayer, provideFrom, provideLayer } from "@/lib/layer-compose.ts";

interface OperationsCatalogLayerInput {
  readonly operationsProgressLayer: AnyLayer;
  readonly runtimeSupportLayer: AnyLayer;
}

export function makeOperationsCatalogLayer(input: OperationsCatalogLayerInput) {
  const { operationsProgressLayer, runtimeSupportLayer } = input;
  const withRuntime = provideFrom(runtimeSupportLayer);

  const buildCatalogSubgraphLayers = () => {
    const runtimeWithProgressLayer = Layer.mergeAll(runtimeSupportLayer, operationsProgressLayer);

    const catalogLibraryReadLayer = withRuntime(CatalogLibraryReadServiceLive);
    const catalogLibraryWriteLayer = withRuntime(CatalogLibraryWriteServiceLive);
    const catalogLibraryScanLayer = provideLayer(
      CatalogLibraryScanServiceLive,
      runtimeWithProgressLayer,
    );
    const importPathScanLayer = withRuntime(ImportPathScanServiceLive);
    const catalogRssLayer = withRuntime(CatalogRssServiceLive);
    const libraryRootsQueryLayer = withRuntime(LibraryRootsQueryServiceLive);

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
  };

  const catalogLayers = buildCatalogSubgraphLayers();

  return {
    catalogSubgraphLayer: catalogLayers.catalogSubgraphLayer,
  } as const;
}
