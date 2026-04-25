import { HttpApp } from "@effect/platform";
import { Effect } from "effect";

import { createHttpAppFallbackResponse } from "@/http/http-app.ts";
import { type EmbeddedWebAsset } from "@/http/shared/embedded-web.ts";
import { assert, it } from "@effect/vitest";

it.effect(
  "http app fallback returns 404 for unknown api routes without serving the app shell",
  () =>
    Effect.gen(function* () {
      const handler = HttpApp.toWebHandler(
        createHttpAppFallbackResponse({
          assets: makeAssets({
            "index.html": "<html><body>app shell</body></html>",
          }),
          method: "GET",
          pathname: "/api/unknown",
        }),
      );

      const response = yield* Effect.promise(() =>
        handler(new Request("http://bakarr.local/api/unknown")),
      );

      assert.deepStrictEqual(response.status, 404);
      assert.deepStrictEqual(yield* Effect.promise(() => response.text()), "");
    }),
);

it.effect("http app fallback serves embedded index.html for app routes", () =>
  Effect.gen(function* () {
    const handler = HttpApp.toWebHandler(
      createHttpAppFallbackResponse({
        assets: makeAssets({
          "index.html": "<html><body>app shell</body></html>",
        }),
        method: "GET",
        pathname: "/library",
      }),
    );

    const response = yield* Effect.promise(() =>
      handler(new Request("http://bakarr.local/library")),
    );

    assert.deepStrictEqual(response.status, 200);
    assert.match(yield* Effect.promise(() => response.text()), /app shell/);
  }),
);

function makeAssets(input: Record<string, string>) {
  const encoder = new TextEncoder();

  return Object.fromEntries(
    Object.entries(input).map(([relativePath, body]) => {
      const bytes = encoder.encode(body);

      return [
        relativePath,
        {
          body: bytes,
          contentType: relativePath.endsWith(".html")
            ? "text/html; charset=utf-8"
            : "text/plain; charset=utf-8",
          size: bytes.byteLength,
        } satisfies EmbeddedWebAsset,
      ];
    }),
  );
}
