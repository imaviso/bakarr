import { Layer } from "effect";

import { AuthBootstrapServiceLive } from "./bootstrap-service.ts";
import { AuthCredentialServiceLive } from "./credential-service.ts";
import { AuthSessionServiceLive } from "./session-service.ts";

export function makeAuthRuntimeLayer<Out, Err, In>(platformLayer: Layer.Layer<Out, Err, In>) {
  return Layer.mergeAll(
    AuthBootstrapServiceLive.pipe(Layer.provide(platformLayer)),
    AuthCredentialServiceLive.pipe(Layer.provide(platformLayer)),
    AuthSessionServiceLive.pipe(Layer.provide(platformLayer)),
  );
}
