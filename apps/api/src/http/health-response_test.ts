import { HttpApp } from "@effect/platform";
import { Effect } from "effect";

import { assertEquals, it } from "../test/vitest.ts";
import { buildHealthLiveResponse, buildHealthReadyResponse } from "./health-response.ts";

it.effect("buildHealthLiveResponse returns the live status payload", () =>
  Effect.gen(function* () {
    const handler = HttpApp.toWebHandler(buildHealthLiveResponse());
    const response = yield* Effect.promise(() => handler(new Request("http://localhost/")));

    assertEquals(response.status, 200);
    assertEquals(response.headers.get("Content-Type"), "application/json");
    assertEquals(yield* Effect.promise(() => response.json()), { status: "alive" });
  }),
);

it.effect("buildHealthReadyResponse returns a ready or not-ready status code", () =>
  Effect.gen(function* () {
    const handler = HttpApp.toWebHandler(
      buildHealthReadyResponse({ checks: { database: false }, ready: false }),
    );
    const response = yield* Effect.promise(() => handler(new Request("http://localhost/")));

    assertEquals(response.status, 503);
    assertEquals(yield* Effect.promise(() => response.json()), {
      checks: { database: false },
      ready: false,
    });
  }),
);
