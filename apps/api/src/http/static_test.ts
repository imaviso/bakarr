import assert from "node:assert/strict";
import { HttpServerResponse } from "@effect/platform";
import { Effect } from "effect";

import { createEmbeddedWebResponse, type EmbeddedWebAsset } from "@/http/embedded-web.ts";
import { it } from "@effect/vitest";

it.effect("static app falls back to index.html for app routes", () =>
  Effect.gen(function* () {
    const response = yield* runStaticRequest({
      assets: makeAssets({
        "index.html": "<html><body>app shell</body></html>",
      }),
      url: "http://bakarr.local/library",
    });

    assert.deepStrictEqual(response.status, 200);
    assert.match(yield* Effect.promise(() => response.text()), /app shell/);
  }),
);

it.effect("static app returns 404 for missing asset paths instead of serving index.html", () =>
  Effect.gen(function* () {
    const response = yield* runStaticRequest({
      assets: makeAssets({
        "index.html": "<html><body>app shell</body></html>",
      }),
      url: "http://bakarr.local/assets/app.js",
    });

    assert.deepStrictEqual(response.status, 404);
    assert.match(yield* Effect.promise(() => response.text()), /not found/i);
  }),
);

it.effect("static app returns 503 when the embedded app shell is unavailable", () =>
  Effect.gen(function* () {
    const response = yield* runStaticRequest({
      assets: {},
      url: "http://bakarr.local/library",
    });

    assert.deepStrictEqual(response.status, 503);
    assert.match(yield* Effect.promise(() => response.text()), /bundle unavailable/i);
  }),
);

function runStaticRequest(input: {
  readonly assets: Record<string, EmbeddedWebAsset>;
  readonly url: string;
}) {
  return Effect.gen(function* () {
    return yield* Effect.sync(() =>
      HttpServerResponse.toWeb(
        createEmbeddedWebResponse({
          assets: input.assets,
          method: "GET",
          pathname: new URL(input.url).pathname,
        }),
      ),
    );
  });
}

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
