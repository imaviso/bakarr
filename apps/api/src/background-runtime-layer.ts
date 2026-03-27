import { Layer } from "effect";

import { BackgroundWorkerControllerLive } from "./background-controller.ts";

export function makeBackgroundRuntimeLayer<
  PlatformOut,
  PlatformErr,
  PlatformIn,
  OperationsOut,
  OperationsErr,
  OperationsIn,
  AnimeOut,
  AnimeErr,
  AnimeIn,
>(
  platformLayer: Layer.Layer<PlatformOut, PlatformErr, PlatformIn>,
  operationsLayer: Layer.Layer<OperationsOut, OperationsErr, OperationsIn>,
  animeLayer: Layer.Layer<AnimeOut, AnimeErr, AnimeIn>,
) {
  return BackgroundWorkerControllerLive.pipe(
    Layer.provide(Layer.mergeAll(platformLayer, operationsLayer, animeLayer)),
  );
}
