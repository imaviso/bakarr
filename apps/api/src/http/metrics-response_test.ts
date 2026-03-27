import { HttpApp } from "@effect/platform";
import { Effect } from "effect";

import { assertEquals, it } from "../test/vitest.ts";
import { buildPrometheusMetricsResponse } from "./metrics-response.ts";

it.effect("buildPrometheusMetricsResponse sets the Prometheus content type", () =>
  Effect.gen(function* () {
    const handler = HttpApp.toWebHandler(
      Effect.succeed(buildPrometheusMetricsResponse("# HELP bakarr_test 1\n")),
    );
    const response = yield* Effect.promise(() => handler(new Request("http://localhost/")));

    const body = yield* Effect.promise(() => response.text());

    assertEquals(body, "# HELP bakarr_test 1\n");
    assertEquals(response.headers.get("Content-Type"), "text/plain; version=0.0.4; charset=utf-8");
  }),
);
