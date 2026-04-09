import { HttpApp, HttpServerResponse } from "@effect/platform";
import { Effect, Schema, Stream } from "effect";

import { assert, it } from "@effect/vitest";
import { NotificationEventSchema, type DownloadStatus } from "@packages/shared/index.ts";
import { buildNotificationEventSseStream } from "@/http/event-stream.ts";

const sampleDownload = {
  anime_id: 10,
  anime_title: "Example Show",
  downloaded_bytes: 256,
  episode_number: 1,
  eta: 0,
  hash: "abc123",
  id: 1,
  is_batch: false,
  name: "Example Episode",
  progress: 0.5,
  speed: 1024,
  state: "downloading",
  total_bytes: 512,
} as const satisfies DownloadStatus;

it.effect("buildNotificationEventSseStream seeds the initial SSE payload", () =>
  Effect.gen(function* () {
    const chunks = yield* Stream.runCollect(
      buildNotificationEventSseStream(
        Stream.fromIterable([
          {
            type: "DownloadProgress",
            payload: { downloads: [sampleDownload] },
          } as const,
        ]),
      ).pipe(
        Stream.take(2),
        Stream.map((chunk) => new TextDecoder().decode(chunk)),
      ),
    );

    const [connected, progress] = Array.from(chunks);
    assert.deepStrictEqual(progress !== undefined, true);
    if (!progress) {
      return;
    }

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

it.effect("buildNotificationEventSseStream response sets SSE headers", () =>
  Effect.gen(function* () {
    const handler = HttpApp.toWebHandler(
      Effect.succeed(
        HttpServerResponse.stream(buildNotificationEventSseStream(Stream.empty), {
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
