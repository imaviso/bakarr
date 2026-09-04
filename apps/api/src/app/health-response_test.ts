import * as HttpApp from "effect/unstable/http/HttpEffect";
import * as HttpRouter from "effect/unstable/http/HttpRouter";

import { assert, it } from "@effect/vitest";
import { AppConfig, makeDefaultAppConfig } from "@/app/config/schema.ts";
import {
  AuthSessionService,
  type AuthSessionServiceShape,
} from "@/features/auth/session-service.ts";
import { StoredConfigMissingError } from "@/features/system/errors.ts";
import {
  SystemReadService,
  type SystemReadServiceShape,
} from "@/features/system/system-read-service.ts";
import { healthRouter } from "@/features/system/http/health-router.ts";
import { Effect } from "effect";

it.effect("health router live endpoint returns the live status payload", () =>
  Effect.gen(function* () {
    const handlerEffect = yield* HttpRouter.toHttpEffect(healthRouter);
    const handler = HttpApp.toWebHandler(
      handlerEffect.pipe(
        Effect.provideService(AppConfig, makeDefaultAppConfig()),
        Effect.provideService(SystemReadService, makeUnusedSystemReadService()),
        Effect.provideService(AuthSessionService, makeUnusedAuthSessionService()),
      ),
    );
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
    const failingReadService: SystemReadServiceShape = {
      getActivity: () => Effect.die(new Error("unused system read service")),
      getBackgroundJobStatuses: () => Effect.die(new Error("unused system read service")),
      getDashboard: () => Effect.die(new Error("unused system read service")),
      getLibraryStats: () => Effect.die(new Error("unused system read service")),
      getSystemStatus: () =>
        Effect.fail(new StoredConfigMissingError({ message: "config missing" })),
    };
    const handlerEffect = yield* HttpRouter.toHttpEffect(healthRouter);
    const handler = HttpApp.toWebHandler(
      handlerEffect.pipe(
        Effect.provideService(AppConfig, makeDefaultAppConfig()),
        Effect.provideService(SystemReadService, failingReadService),
        Effect.provideService(AuthSessionService, makeUnusedAuthSessionService()),
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

function makeUnusedSystemReadService(): SystemReadServiceShape {
  return SystemReadService.of({
    getActivity: () => Effect.die(new Error("unused system read service")),
    getBackgroundJobStatuses: () => Effect.die(new Error("unused system read service")),
    getDashboard: () => Effect.die(new Error("unused system read service")),
    getLibraryStats: () => Effect.die(new Error("unused system read service")),
    getSystemStatus: () => Effect.die(new Error("unused system status service")),
  });
}

function makeUnusedAuthSessionService(): AuthSessionServiceShape {
  return AuthSessionService.of({
    login: () => Effect.die(new Error("unused auth service")),
    loginWithApiKey: () => Effect.die(new Error("unused auth service")),
    logout: () => Effect.die(new Error("unused auth service")),
    resolveViewer: () => Effect.die(new Error("unused auth service")),
  });
}
