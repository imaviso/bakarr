import { HttpServerRequest, HttpServerResponse } from "@effect/platform";
import { Cause, Effect, Option } from "effect";

import {
  AppConfigModel,
  makeDefaultAppConfig,
  type AppConfigShape,
  AppConfig,
} from "@/config/schema.ts";
import { AuthForbiddenError, AuthUnauthorizedError } from "@/features/auth/errors.ts";
import {
  AuthSessionService,
  type AuthSessionServiceShape,
} from "@/features/auth/session-service.ts";
import { persistSessionResponse, requireViewerFromHttpRequest } from "@/http/shared/route-auth.ts";
import { assert, it } from "@effect/vitest";
import { brandUserId, type AuthUser } from "@packages/shared/index.ts";

const sampleViewer: AuthUser = {
  created_at: "2026-01-01T00:00:00.000Z",
  id: brandUserId(1),
  must_change_password: false,
  updated_at: "2026-01-01T00:00:00.000Z",
  username: "demo",
};

it.effect("requireViewerFromHttpRequest prefers x-api-key over bearer authorization", () =>
  Effect.gen(function* () {
    let seenSessionToken: string | undefined;
    let seenApiKey: string | undefined;
    let resolveViewerCalls = 0;

    const request = HttpServerRequest.fromWeb(
      new Request("http://localhost/api/auth/me", {
        headers: {
          authorization: "Bearer bearer-token",
          cookie: "bakarr_session=session-token",
          "x-api-key": "header-token",
        },
      }),
    );

    const viewer = yield* requireViewerFromHttpRequest().pipe(
      Effect.provideService(HttpServerRequest.HttpServerRequest, request),
      Effect.provideService(AppConfig, makeConfig()),
      Effect.provideService(
        AuthSessionService,
        makeAuthSessionService((sessionToken, apiKey) =>
          Effect.sync(() => {
            resolveViewerCalls += 1;
            seenSessionToken = sessionToken;
            seenApiKey = apiKey;
            return apiKey === "header-token" ? Option.some(sampleViewer) : Option.none();
          }),
        ),
      ),
    );

    assert.deepStrictEqual(viewer, sampleViewer);
    assert.deepStrictEqual(resolveViewerCalls, 1);
    assert.deepStrictEqual(seenSessionToken, "session-token");
    assert.deepStrictEqual(seenApiKey, "header-token");
  }),
);

it.effect("requireViewerFromHttpRequest falls back to bearer token when x-api-key is missing", () =>
  Effect.gen(function* () {
    let seenApiKey: string | undefined;

    const request = HttpServerRequest.fromWeb(
      new Request("http://localhost/api/auth/me", {
        headers: {
          authorization: "Bearer bearer-token",
        },
      }),
    );

    const viewer = yield* requireViewerFromHttpRequest().pipe(
      Effect.provideService(HttpServerRequest.HttpServerRequest, request),
      Effect.provideService(AppConfig, makeConfig()),
      Effect.provideService(
        AuthSessionService,
        makeAuthSessionService((_sessionToken, apiKey) =>
          Effect.sync(() => {
            seenApiKey = apiKey;
            return Option.some(sampleViewer);
          }),
        ),
      ),
    );

    assert.deepStrictEqual(viewer, sampleViewer);
    assert.deepStrictEqual(seenApiKey, "bearer-token");
  }),
);

it.effect("requireViewerFromHttpRequest fails with AuthError when viewer is missing", () =>
  Effect.gen(function* () {
    const request = HttpServerRequest.fromWeb(new Request("http://localhost/api/auth/me"));

    const exit = yield* Effect.exit(
      requireViewerFromHttpRequest().pipe(
        Effect.provideService(HttpServerRequest.HttpServerRequest, request),
        Effect.provideService(AppConfig, makeConfig()),
        Effect.provideService(
          AuthSessionService,
          makeAuthSessionService(() => Effect.succeed(Option.none())),
        ),
      ),
    );

    assert.deepStrictEqual(exit._tag, "Failure");
    if (exit._tag === "Failure") {
      const failure = Cause.failureOption(exit.cause);
      assert.deepStrictEqual(failure._tag, "Some");
      if (failure._tag === "Some") {
        assert.deepStrictEqual(failure.value instanceof AuthUnauthorizedError, true);
      }
    }
  }),
);

it.effect("requireViewerFromHttpRequest blocks users who must change password", () =>
  Effect.gen(function* () {
    const request = HttpServerRequest.fromWeb(new Request("http://localhost/api/media"));

    const exit = yield* Effect.exit(
      requireViewerFromHttpRequest().pipe(
        Effect.provideService(HttpServerRequest.HttpServerRequest, request),
        Effect.provideService(AppConfig, makeConfig()),
        Effect.provideService(
          AuthSessionService,
          makeAuthSessionService(() =>
            Effect.succeed(Option.some({ ...sampleViewer, must_change_password: true })),
          ),
        ),
      ),
    );

    assert.deepStrictEqual(exit._tag, "Failure");
    if (exit._tag === "Failure") {
      const failure = Cause.failureOption(exit.cause);
      assert.deepStrictEqual(failure._tag, "Some");
      if (failure._tag === "Some" && failure.value instanceof AuthForbiddenError) {
        assert.deepStrictEqual(failure.value.message, "Password change required");
      }
    }
  }),
);

it.effect("requireViewerFromHttpRequest allows password change when explicitly requested", () =>
  Effect.gen(function* () {
    const request = HttpServerRequest.fromWeb(new Request("http://localhost/api/auth/password"));

    const viewer = yield* requireViewerFromHttpRequest({
      allowPasswordChangeRequired: true,
    }).pipe(
      Effect.provideService(HttpServerRequest.HttpServerRequest, request),
      Effect.provideService(AppConfig, makeConfig()),
      Effect.provideService(
        AuthSessionService,
        makeAuthSessionService(() =>
          Effect.succeed(Option.some({ ...sampleViewer, must_change_password: true })),
        ),
      ),
    );

    assert.deepStrictEqual(viewer.must_change_password, true);
  }),
);

it.effect("persistSessionResponse sets secure cookie flags when configured", () =>
  Effect.gen(function* () {
    const config = makeConfig({
      sessionCookieName: "auth_session",
      sessionCookieSecure: true,
      sessionDurationDays: 7,
    });

    const response = yield* persistSessionResponse("session-token", { ok: true }).pipe(
      Effect.provideService(AppConfig, config),
    );

    const webResponse = HttpServerResponse.toWeb(response);
    const setCookie = webResponse.headers.get("set-cookie");

    assert.ok(setCookie != null);
    assert.match(setCookie, /^auth_session=session-token/i);
    assert.match(setCookie, /Max-Age=604800/i);
    assert.match(setCookie, /HttpOnly/i);
    assert.match(setCookie, /SameSite=Lax/i);
    assert.match(setCookie, /Secure/i);
  }),
);

it.effect("persistSessionResponse omits secure flag when disabled", () =>
  Effect.gen(function* () {
    const response = yield* persistSessionResponse("session-token", { ok: true }).pipe(
      Effect.provideService(
        AppConfig,
        makeConfig({
          sessionCookieName: "auth_session",
          sessionCookieSecure: false,
          sessionDurationDays: 7,
        }),
      ),
    );

    const webResponse = HttpServerResponse.toWeb(response);
    const setCookie = webResponse.headers.get("set-cookie");

    assert.ok(setCookie != null);
    assert.deepStrictEqual(setCookie.includes("Secure"), false);
  }),
);

function makeConfig(overrides: Partial<AppConfigShape> = {}): AppConfigShape {
  const defaults = makeDefaultAppConfig();
  return new AppConfigModel({
    appVersion: overrides.appVersion ?? defaults.appVersion,
    databaseFile: overrides.databaseFile ?? defaults.databaseFile,
    port: overrides.port ?? defaults.port,
    sessionCookieName: overrides.sessionCookieName ?? defaults.sessionCookieName,
    sessionCookieSecure: overrides.sessionCookieSecure ?? defaults.sessionCookieSecure,
    sessionDurationDays: overrides.sessionDurationDays ?? defaults.sessionDurationDays,
  });
}

function makeAuthSessionService(
  resolveViewer: AuthSessionServiceShape["resolveViewer"],
): AuthSessionServiceShape {
  return {
    login: () => Effect.die("unused"),
    loginWithApiKey: () => Effect.die("unused"),
    logout: () => Effect.die("unused"),
    resolveViewer,
  };
}
