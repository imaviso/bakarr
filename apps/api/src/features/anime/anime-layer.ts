import { Layer } from "effect";

import { AnimeImportServiceLive } from "./import-service.ts";
import { AnimeFileServiceLive } from "./file-service.ts";
import { AnimeMutationServiceLive } from "./mutation-service.ts";
import { AnimeQueryServiceLive } from "./query-service.ts";

export function makeAnimeFeatureLayer<APlatform, EPlatform, RPlatform>(
  platformLayer: Layer.Layer<APlatform, EPlatform, RPlatform>,
) {
  const providePlatform = Layer.provideMerge(platformLayer);

  return Layer.mergeAll(
    AnimeQueryServiceLive.pipe(providePlatform),
    AnimeMutationServiceLive.pipe(providePlatform),
    AnimeFileServiceLive.pipe(providePlatform),
    AnimeImportServiceLive.pipe(providePlatform),
  );
}
