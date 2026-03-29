import { Layer } from "effect";

import { AuthBootstrapServiceLive } from "./bootstrap-service.ts";
import { AuthCredentialServiceLive } from "./credential-service.ts";
import { AuthSessionServiceLive } from "./session-service.ts";

export function makeAuthFeatureLayer<APlatform, EPlatform, RPlatform>(
  platformLayer: Layer.Layer<APlatform, EPlatform, RPlatform>,
) {
  return Layer.mergeAll(
    AuthBootstrapServiceLive.pipe(Layer.provideMerge(platformLayer)),
    AuthCredentialServiceLive.pipe(Layer.provideMerge(platformLayer)),
    AuthSessionServiceLive.pipe(Layer.provideMerge(platformLayer)),
  );
}
