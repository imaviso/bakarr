import { Layer } from "effect";

import { AuthBootstrapServiceLive } from "@/features/auth/bootstrap-service.ts";
import { AuthCredentialServiceLive } from "@/features/auth/credential-service.ts";
import { AuthSessionServiceLive } from "@/features/auth/session-service.ts";
import { provideLayer } from "@/lib/layer-compose.ts";

export function makeAuthAppLayer<RSOut, RSE, RSR>(
  runtimeSupportLayer: Layer.Layer<RSOut, RSE, RSR>,
) {
  return provideLayer(
    Layer.mergeAll(AuthBootstrapServiceLive, AuthCredentialServiceLive, AuthSessionServiceLive),
    runtimeSupportLayer,
  );
}
