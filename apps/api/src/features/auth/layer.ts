import { Layer } from "effect";

import { AuthBootstrapServiceLive } from "@/features/auth/bootstrap-service.ts";
import { AuthCredentialServiceLive } from "@/features/auth/credential-service.ts";
import { AuthSessionServiceLive } from "@/features/auth/session-service.ts";
import { AuthUserRepositoryLive } from "@/features/auth/user-repository.ts";

export function makeAuthFeatureLayer<ROut, E, RIn>(runtimeSupportLayer: Layer.Layer<ROut, E, RIn>) {
  return Layer.mergeAll(
    AuthBootstrapServiceLive,
    AuthCredentialServiceLive,
    AuthSessionServiceLive,
  ).pipe(Layer.provide(AuthUserRepositoryLive), Layer.provide(runtimeSupportLayer));
}
