import { Layer } from "effect";

import { AuthBootstrapServiceLive } from "./bootstrap-service.ts";
import { AuthCredentialServiceLive } from "./credential-service.ts";
import { AuthSessionServiceLive } from "./session-service.ts";

export function makeAuthFeatureLayer<APlatform, EPlatform, RPlatform>(
  platformLayer: Layer.Layer<APlatform, EPlatform, RPlatform>,
) {
  const providePlatform = Layer.provideMerge(platformLayer);

  return Layer.mergeAll(
    AuthBootstrapServiceLive.pipe(providePlatform),
    AuthCredentialServiceLive.pipe(providePlatform),
    AuthSessionServiceLive.pipe(providePlatform),
  );
}
