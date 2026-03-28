import { Layer } from "effect";

import {
  AnimeFileServiceLive,
  AnimeMutationServiceLive,
  AnimeQueryServiceLive,
} from "./service.ts";
import { AnimeImportServiceLive } from "./import-service.ts";

export function makeAnimeRuntimeLayer<Out, Err, In>(platformLayer: Layer.Layer<Out, Err, In>) {
  return Layer.mergeAll(
    AnimeQueryServiceLive,
    AnimeMutationServiceLive,
    AnimeFileServiceLive,
    AnimeImportServiceLive,
  ).pipe(Layer.provide(platformLayer));
}
