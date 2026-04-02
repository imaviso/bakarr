import assert from "node:assert/strict";
import { HttpApp, HttpServerResponse } from "@effect/platform";
import { Effect, Schema, Stream } from "effect";

import { it } from "@effect/vitest";
import { makeEventBus } from "@/features/events/event-bus.ts";
import { NotificationEventSchema } from "@packages/shared/index.ts";
import { buildDownloadProgressStream } from "@/http/event-stream.ts";

const sampleDownload = {
  downloaded_bytes: 256,
  eta: 0,
  hash: "abc123",
  name: "Example Episode",
  progress: 0.5,
  speed: 1024,
  state: "downloading",
  total_bytes: 512,
} as const;

it.effect("buildDownloadProgressStream seeds the initial SSE payload", () =>
  Effect.gen(function* () {
    const eventBus = yield* makeEventBus({ capacity: 8 });
    const chunks = yield* Stream.runCollect(
      buildDownloadProgressStream([sampleDownload], eventBus).pipe(
        Stream.take(2),
        Stream.map((chunk) => new TextDecoder().decode(chunk)),
      ),
    );

    const [connected, progress] = Array.from(chunks);

    assert.deepStrictEqual(connected, ": connected\n\n");
    assert.deepStrictEqual(progress.startsWith("data: "), true);

    const encoded = progress.slice("data: ".length, -2);
    const event = Schema.decodeUnknownEither(Schema.parseJson(NotificationEventSchema))(encoded);

    assert.deepStrictEqual(event._tag, "Right");

    if (event._tag === "Right" && event.right.type === "DownloadProgress") {
      assert.deepStrictEqual(event.right.type, "DownloadProgress");
      assert.deepStrictEqual(event.right.payload.downloads.length, 1);
    }
  }),
);

it.effect("buildDownloadProgressResponse sets SSE headers", () =>
  Effect.gen(function* () {
    const eventBus = yield* makeEventBus({ capacity: 8 });
    const handler = HttpApp.toWebHandler(
      Effect.succeed(
        HttpServerResponse.stream(buildDownloadProgressStream([sampleDownload], eventBus), {
          contentType: "text/event-stream",
          headers: {
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
          },
        }),
      ),
    );
    const response = yield* Effect.promise(() => handler(new Request("http://localhost/")));

    assert.deepStrictEqual(response.headers.get("Content-Type"), "text/event-stream");
    assert.deepStrictEqual(response.headers.get("Cache-Control"), "no-cache");
    assert.deepStrictEqual(response.headers.get("Connection"), "keep-alive");
  }),
);
