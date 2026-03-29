import { HttpApp, HttpServerResponse } from "@effect/platform";
import { Effect } from "effect";

import { assertEquals, it } from "@/test/vitest.ts";

it.effect("inline health live response returns the live status payload", () =>
  Effect.gen(function* () {
    const handler = HttpApp.toWebHandler(HttpServerResponse.json({ status: "alive" }));
    const response = yield* Effect.promise(() => handler(new Request("http://localhost/")));

    assertEquals(response.status, 200);
    assertEquals(response.headers.get("Content-Type"), "application/json");
    assertEquals(yield* Effect.promise(() => response.json()), { status: "alive" });
  }),
);

it.effect("buildHealthReadyResponse returns a ready or not-ready status code", () =>
  Effect.gen(function* () {
    const handler = HttpApp.toWebHandler(
      HttpServerResponse.json({ checks: { database: false }, ready: false }, { status: 503 }),
    );
    const response = yield* Effect.promise(() => handler(new Request("http://localhost/")));

    assertEquals(response.status, 503);
    assertEquals(yield* Effect.promise(() => response.json()), {
      checks: { database: false },
      ready: false,
    });
  }),
);
