import { Layer } from "effect";

import { AuthServiceLive } from "./service.ts";

export function makeAuthRuntimeLayer<Out, Err, In>(platformLayer: Layer.Layer<Out, Err, In>) {
  return AuthServiceLive.pipe(Layer.provide(platformLayer));
}
