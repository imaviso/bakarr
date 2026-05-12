import { HttpApp } from "@effect/platform";
import { Effect } from "effect";

import { assert, it } from "@effect/vitest";
import { AppConfig, makeDefaultAppConfig } from "@/config/schema.ts";
import { AuthSessionService } from "@/features/auth/session-service.ts";
import { StoredConfigMissingError } from "@/features/system/errors.ts";
import { SystemReadService } from "@/features/system/system-read-service.ts";
import { healthRouter } from "@/http/system/health-router.ts";

it.effect("health router live endpoint returns the live status payload", () =>
  Effect.gen(function* () {
    const handler = HttpApp.toWebHandler(healthRouter.pipe(provideHealthRouterTestServices()));
    const response = yield* Effect.promise(() =>
      handler(new Request("http://localhost/api/system/health/live")),
    );

    assert.deepStrictEqual(response.status, 200);
    assert.deepStrictEqual(response.headers.get("Content-Type"), "application/json");
    assert.deepStrictEqual(yield* Effect.promise(() => response.json()), { status: "alive" });
  }),
);

it.effect("health router ready endpoint maps system status failure to not-ready", () =>
  Effect.gen(function* () {
    const handler = HttpApp.toWebHandler(
      healthRouter.pipe(
        provideSharedRouterTestServices(),
        Effect.provideService(SystemReadService, {
          getActivity: () => Effect.die("unused system read service"),
          getDashboard: () => Effect.die("unused system read service"),
          getLibraryStats: () => Effect.die("unused system read service"),
          getSystemStatus: () =>
            Effect.fail(new StoredConfigMissingError({ message: "config missing" })),
        }),
      ),
    );
    const response = yield* Effect.promise(() =>
      handler(new Request("http://localhost/api/system/health/ready")),
    );

    assert.deepStrictEqual(response.status, 503);
    assert.deepStrictEqual(yield* Effect.promise(() => response.json()), {
      checks: { database: false },
      ready: false,
    });
  }),
);

function provideHealthRouterTestServices() {
  return (effect: typeof healthRouter) =>
    effect.pipe(
      provideSharedRouterTestServices(),
      Effect.provideService(SystemReadService, {
        getActivity: () => Effect.die("unused system read service"),
        getDashboard: () => Effect.die("unused system read service"),
        getLibraryStats: () => Effect.die("unused system read service"),
        getSystemStatus: () => Effect.die("unused system status service"),
      }),
    );
}

function provideSharedRouterTestServices() {
  return <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    effect.pipe(
      Effect.provideService(AppConfig, makeDefaultAppConfig()),
      Effect.provideService(AuthSessionService, {
        login: () => Effect.die("unused auth service"),
        loginWithApiKey: () => Effect.die("unused auth service"),
        logout: () => Effect.die("unused auth service"),
        resolveViewer: () => Effect.die("unused auth service"),
      }),
    );
}
