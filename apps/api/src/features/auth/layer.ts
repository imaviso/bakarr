import { Layer } from "effect";

import { AuthBootstrapServiceLive } from "@/features/auth/bootstrap-service.ts";
import { AuthCredentialServiceLive } from "@/features/auth/credential-service.ts";
import { AuthSessionServiceLive } from "@/features/auth/session-service.ts";
import { AuthUserRepository } from "@/features/auth/user-repository.ts";

export function makeAuthFeatureLayer<ROut, E, RIn>(runtimeSupportLayer: Layer.Layer<ROut, E, RIn>) {
  const authUserRepositoryLayer = AuthUserRepository.Default.pipe(
    Layer.provide(runtimeSupportLayer),
  );

  return Layer.mergeAll(
    authUserRepositoryLayer,
    AuthBootstrapServiceLive,
    AuthCredentialServiceLive,
    AuthSessionServiceLive,
  ).pipe(Layer.provide(Layer.mergeAll(runtimeSupportLayer, authUserRepositoryLayer)));
}
