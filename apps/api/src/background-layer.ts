import { Layer } from "effect";

import { BackgroundWorkerControllerLive } from "./background-controller-live.ts";

export function makeBackgroundFeatureLayer<
  APlatform,
  EPlatform,
  RPlatform,
  AOperations,
  EOperations,
  ROperations,
  AAnime,
  EAnime,
  RAnime,
>(
  platformLayer: Layer.Layer<APlatform, EPlatform, RPlatform>,
  operationsLayer: Layer.Layer<AOperations, EOperations, ROperations>,
  animeLayer: Layer.Layer<AAnime, EAnime, RAnime>,
) {
  const backgroundDependenciesLayer = Layer.mergeAll(platformLayer, operationsLayer, animeLayer);

  return BackgroundWorkerControllerLive.pipe(Layer.provideMerge(backgroundDependenciesLayer));
}
