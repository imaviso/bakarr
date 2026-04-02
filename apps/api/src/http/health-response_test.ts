import { HttpApp, HttpServerResponse } from "@effect/platform";
import { Effect } from "effect";

import { assert, it } from "@effect/vitest";

it.effect("inline health live response returns the live status payload", () =>
  Effect.gen(function* () {
    const handler = HttpApp.toWebHandler(HttpServerResponse.json({ status: "alive" }));
    const response = yield* Effect.promise(() => handler(new Request("http://localhost/")));

    assert.deepStrictEqual(response.status, 200);
    assert.deepStrictEqual(response.headers.get("Content-Type"), "application/json");
    assert.deepStrictEqual(yield* Effect.promise(() => response.json()), { status: "alive" });
  }),
);

it.effect("buildHealthReadyResponse returns a ready or not-ready status code", () =>
  Effect.gen(function* () {
    const handler = HttpApp.toWebHandler(
      HttpServerResponse.json({ checks: { database: false }, ready: false }, { status: 503 }),
    );
    const response = yield* Effect.promise(() => handler(new Request("http://localhost/")));

    assert.deepStrictEqual(response.status, 503);
    assert.deepStrictEqual(yield* Effect.promise(() => response.json()), {
      checks: { database: false },
      ready: false,
    });
  }),
);
