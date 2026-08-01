import { Layer } from "effect";

import { AuthBootstrapServiceLive } from "@/features/auth/bootstrap-service.ts";
import { AuthCredentialServiceLive } from "@/features/auth/credential-service.ts";
import { AuthSessionServiceLive } from "@/features/auth/session-service.ts";

/**
 * Auth feature root.
 *
 * Declarative merge of self-contained `Effect.Service` Defaults: each service
 * already declares AuthUserRepository + crypto/random dependencies in its own
 * `dependencies:` array. AuthUserRepository itself is a pure-db leaf provided
 * once in app/pure-db-leaves.ts per ADR-0001. AppConfig/BootstrapConfig and
 * EventBus come from the lifecycle layer — see app/lifecycle-layers.ts.
 */
export const AuthFeatureLayer = Layer.mergeAll(
  AuthBootstrapServiceLive,
  AuthCredentialServiceLive,
  AuthSessionServiceLive,
);
