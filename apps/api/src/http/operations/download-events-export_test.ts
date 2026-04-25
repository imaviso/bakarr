import { HttpApp, HttpServerResponse } from "@effect/platform";
import { Effect } from "effect";

import { assert, it } from "@effect/vitest";

it.effect("inline download events export response adds export metadata headers", () =>
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
      Effect.succeed(
        HttpServerResponse.text("[]", {
          contentType: "application/json; charset=utf-8",
          headers: {
            "Content-Disposition": `attachment; filename="bakarr-download-events.json"`,
            "X-Bakarr-Export-Limit": String(page.limit),
            "X-Bakarr-Export-Order": page.order,
            "X-Bakarr-Export-Truncated": String(page.truncated),
            "X-Bakarr-Exported-Events": String(page.exported),
            "X-Bakarr-Generated-At": page.generated_at,
            "X-Bakarr-Total-Events": String(page.total),
          },
        }),
      ),
    );
    const response = yield* Effect.promise(() => handler(new Request("http://localhost/")));

    assert.deepStrictEqual(response.headers.get("X-Bakarr-Exported-Events"), "3");
    assert.deepStrictEqual(response.headers.get("X-Bakarr-Export-Limit"), "50");
    assert.deepStrictEqual(response.headers.get("X-Bakarr-Export-Order"), "desc");
    assert.deepStrictEqual(response.headers.get("X-Bakarr-Export-Truncated"), "true");
    assert.deepStrictEqual(
      response.headers.get("X-Bakarr-Generated-At"),
      "2026-03-27T00:00:00.000Z",
    );
    assert.deepStrictEqual(response.headers.get("X-Bakarr-Total-Events"), "12");
  }),
);
