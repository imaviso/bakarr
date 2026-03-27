import { Layer } from "effect";

import {
  AnimeFileServiceLive,
  AnimeMutationServiceLive,
  AnimeQueryServiceLive,
} from "./service.ts";

export function makeAnimeRuntimeLayer<Out, Err, In>(platformLayer: Layer.Layer<Out, Err, In>) {
  return Layer.mergeAll(AnimeQueryServiceLive, AnimeMutationServiceLive, AnimeFileServiceLive).pipe(
    Layer.provide(platformLayer),
  );
}
