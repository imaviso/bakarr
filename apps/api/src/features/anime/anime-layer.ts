import { Layer } from "effect";

import { AnimeImportServiceLive } from "./import-service.ts";
import { AnimeFileServiceLive } from "./file-service.ts";
import { AnimeMutationServiceLive } from "./mutation-service.ts";
import { AnimeQueryServiceLive } from "./query-service.ts";

export function makeAnimeFeatureLayer<APlatform, EPlatform, RPlatform>(
  platformLayer: Layer.Layer<APlatform, EPlatform, RPlatform>,
) {
  return Layer.mergeAll(
    AnimeQueryServiceLive.pipe(Layer.provideMerge(platformLayer)),
    AnimeMutationServiceLive.pipe(Layer.provideMerge(platformLayer)),
    AnimeFileServiceLive.pipe(Layer.provideMerge(platformLayer)),
    AnimeImportServiceLive.pipe(Layer.provideMerge(platformLayer)),
  );
}
