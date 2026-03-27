import { HttpApp } from "@effect/platform";
import { Effect } from "effect";

import { assertEquals, it } from "../test/vitest.ts";
import { buildDownloadEventsExportResponse } from "./download-events-export.ts";

it.effect("buildDownloadEventsExportResponse adds export metadata headers", () =>
  Effect.gen(function* () {
    const page = {
      events: [],
      exported: 3,
      generated_at: "2026-03-27T00:00:00.000Z",
      limit: 50,
      order: "desc" as const,
      total: 12,
      truncated: true,
    };

    const handler = HttpApp.toWebHandler(
      Effect.succeed(buildDownloadEventsExportResponse(page, "json")),
    );
    const response = yield* Effect.promise(() => handler(new Request("http://localhost/")));

    assertEquals(response.headers.get("X-Bakarr-Exported-Events"), "3");
    assertEquals(response.headers.get("X-Bakarr-Export-Limit"), "50");
    assertEquals(response.headers.get("X-Bakarr-Export-Order"), "desc");
    assertEquals(response.headers.get("X-Bakarr-Export-Truncated"), "true");
    assertEquals(response.headers.get("X-Bakarr-Generated-At"), "2026-03-27T00:00:00.000Z");
    assertEquals(response.headers.get("X-Bakarr-Total-Events"), "12");
  }),
);
