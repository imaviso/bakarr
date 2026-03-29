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
  const providePlatform = Layer.provideMerge(platformLayer);
  const libraryRootsLayer = LibraryRootsServiceLive.pipe(providePlatform);
  const libraryBrowseDependenciesLayer = Layer.mergeAll(
    platformLayer,
    operationsLayer,
    systemLayer,
    libraryRootsLayer,
  );
  const provideLibraryBrowseDependencies = Layer.provideMerge(libraryBrowseDependenciesLayer);
  const libraryBrowseLayer = LibraryBrowseServiceLive.pipe(provideLibraryBrowseDependencies);

  return Layer.mergeAll(libraryRootsLayer, libraryBrowseLayer);
}
