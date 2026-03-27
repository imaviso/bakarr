import { HttpServerResponse } from "@effect/platform";
import { Effect, Schema, Stream } from "effect";

import {
  NotificationEventSchema,
  type DownloadStatus,
  type NotificationEvent,
} from "../../../../packages/shared/src/index.ts";
import type { EventBusShape } from "../features/events/event-bus.ts";

const NotificationEventJsonSchema = Schema.parseJson(NotificationEventSchema);
const encodeNotificationEvent = Schema.encodeSync(NotificationEventJsonSchema);

export function buildDownloadProgressStream(
  downloads: readonly DownloadStatus[],
  eventBus: EventBusShape,
) {
  return Stream.unwrapScoped(
    Effect.gen(function* () {
      const encoder = new TextEncoder();
      const encodeSse = (payload: string) => encoder.encode(`${payload}\n\n`);
      const encodeNotificationSse = (event: NotificationEvent) =>
        encodeSse(`data: ${encodeNotificationEvent(event)}`);

      const subscription = yield* eventBus.subscribe();
      const initialEvents = Stream.fromIterable([
        encodeSse(": connected"),
        encodeNotificationSse({
          type: "DownloadProgress",
          payload: { downloads: [...downloads] },
        }),
      ]);
      const liveEvents = Stream.merge(
        subscription.stream.pipe(Stream.map(encodeNotificationSse)),
        Stream.tick("15 seconds").pipe(Stream.as(encodeSse(": keep-alive"))),
      ).pipe(Stream.withSpan("http.events.stream"));

      return Stream.concat(initialEvents, liveEvents);
    }),
  );
}

export function buildDownloadProgressResponse(
  downloads: readonly DownloadStatus[],
  eventBus: EventBusShape,
) {
  return HttpServerResponse.stream(buildDownloadProgressStream(downloads, eventBus), {
    contentType: "text/event-stream",
    headers: {
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
