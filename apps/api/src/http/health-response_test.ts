import { HttpRouter } from "effect/unstable/http";
import { Effect, Layer } from "effect";

import { assert, it } from "@effect/vitest";
import { AppConfig, makeDefaultAppConfig } from "@/config/schema.ts";
import { AuthSessionService } from "@/features/auth/session-service.ts";
import { StoredConfigMissingError } from "@/features/system/errors.ts";
import { SystemReadService } from "@/features/system/system-read-service.ts";
import { healthRoutes } from "@/http/system/health-router.ts";

it.effect("health router live endpoint returns the live status payload", () =>
  Effect.gen(function* () {
    const { handler } = HttpRouter.toWebHandler(makeHealthRouterLayer(), {
      disableLogger: true,
    });
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
    const { handler } = HttpRouter.toWebHandler(
      makeHealthRouterLayer(
        Layer.succeed(SystemReadService, {
          getActivity: () => Effect.die(new Error("unused system read service")),
          getDashboard: () => Effect.die(new Error("unused system read service")),
          getLibraryStats: () => Effect.die(new Error("unused system read service")),
          getSystemStatus: () =>
            Effect.fail(new StoredConfigMissingError({ message: "config missing" })),
        }),
      ),
      { disableLogger: true },
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

function makeHealthRouterLayer(
  systemReadLayer: Layer.Layer<SystemReadService> = unusedSystemReadLayer,
) {
  return Layer.mergeAll(
    HttpRouter.addAll(healthRoutes),
    Layer.succeed(AppConfig, makeDefaultAppConfig()),
    Layer.succeed(AuthSessionService, {
      login: () => Effect.die(new Error("unused auth service")),
      loginWithApiKey: () => Effect.die(new Error("unused auth service")),
      logout: () => Effect.die(new Error("unused auth service")),
      resolveViewer: () => Effect.die(new Error("unused auth service")),
    }),
    systemReadLayer,
  );
}

const unusedSystemReadLayer = Layer.succeed(SystemReadService, {
  getActivity: () => Effect.die(new Error("unused system read service")),
  getDashboard: () => Effect.die(new Error("unused system read service")),
  getLibraryStats: () => Effect.die(new Error("unused system read service")),
  getSystemStatus: () => Effect.die(new Error("unused system status service")),
});
