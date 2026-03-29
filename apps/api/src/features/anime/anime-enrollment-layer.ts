import { Layer } from "effect";

import { AnimeEnrollmentServiceLive } from "./anime-enrollment-service.ts";

export function makeAnimeEnrollmentFeatureLayer<
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
  return AnimeEnrollmentServiceLive.pipe(
    Layer.provideMerge(Layer.mergeAll(platformLayer, operationsLayer, animeLayer)),
  );
}
