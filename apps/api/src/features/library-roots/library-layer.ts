import { Layer } from "effect";

import { LibraryBrowseServiceLive } from "../operations/library-browse-service.ts";
import { LibraryRootsServiceLive } from "./service.ts";

export function makeLibraryFeatureLayer<
  APlatform,
  EPlatform,
  RPlatform,
  AOperations,
  EOperations,
  ROperations,
  ASystem,
  ESystem,
  RSystem,
>(
  platformLayer: Layer.Layer<APlatform, EPlatform, RPlatform>,
  operationsLayer: Layer.Layer<AOperations, EOperations, ROperations>,
  systemLayer: Layer.Layer<ASystem, ESystem, RSystem>,
) {
  const libraryRootsLayer = LibraryRootsServiceLive.pipe(Layer.provideMerge(platformLayer));
  const libraryBrowseLayer = LibraryBrowseServiceLive.pipe(
    Layer.provideMerge(
      Layer.mergeAll(platformLayer, operationsLayer, systemLayer, libraryRootsLayer),
    ),
  );

  return Layer.mergeAll(libraryRootsLayer, libraryBrowseLayer);
}
