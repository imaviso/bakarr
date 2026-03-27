import { HttpApp } from "@effect/platform";
import { Effect } from "effect";

import { assertEquals, it } from "../test/vitest.ts";
import { buildImageAssetResponse } from "./image-asset-response.ts";

it.effect("buildImageAssetResponse sets cache headers and content type", () =>
  Effect.gen(function* () {
    const bytes = new TextEncoder().encode("image-bytes");
    const handler = HttpApp.toWebHandler(
      Effect.succeed(buildImageAssetResponse(bytes, "/images/banner.png")),
    );
    const response = yield* Effect.promise(() => handler(new Request("http://localhost/")));

    assertEquals(response.headers.get("Content-Type"), "image/png");
    assertEquals(response.headers.get("Cache-Control"), "public, max-age=31536000, immutable");
    assertEquals(response.headers.get("Content-Length"), String(bytes.length));

    const body = yield* Effect.promise(() => response.text());
    assertEquals(body, "image-bytes");
  }),
);
