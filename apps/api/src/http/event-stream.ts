import { Effect, Schema, Stream } from "effect";

import {
  NotificationEventSchema,
  type DownloadStatus,
  type NotificationEvent,
} from "@packages/shared/index.ts";
import type { EventBusShape } from "@/features/events/event-bus.ts";

const sseEncoder = new TextEncoder();
const NotificationEventJsonSchema = Schema.parseJson(NotificationEventSchema);

export class NotificationEventEncodeError extends Schema.TaggedError<NotificationEventEncodeError>()(
  "NotificationEventEncodeError",
  {
    cause: Schema.optional(Schema.Defect),
    message: Schema.String,
  },
) {}

const encodeSseChunk = (payload: string) => sseEncoder.encode(`${payload}\n\n`);

export const encodeNotificationEventSse = Effect.fn("Http.encodeNotificationEventSse")(function* (
  event: NotificationEvent,
) {
  const encodedEvent = yield* Schema.encode(NotificationEventJsonSchema)(event).pipe(
    Effect.mapError(
      (cause) =>
        new NotificationEventEncodeError({
          cause,
          message: "Notification event could not be encoded for SSE",
        }),
    ),
  );

  return encodeSseChunk(`data: ${encodedEvent}`);
});

export function buildDownloadProgressStream(
  downloads: readonly DownloadStatus[],
  eventBus: EventBusShape,
) {
  return Stream.unwrapScoped(
    Effect.gen(function* () {
      const subscription = yield* eventBus.subscribe();
      const initialEvents = Stream.fromIterable([
        encodeSseChunk(": connected"),
        yield* encodeNotificationEventSse({
          type: "DownloadProgress",
          payload: { downloads: [...downloads] },
        }),
      ]);
      const liveEvents = Stream.merge(
        subscription.stream.pipe(Stream.mapEffect(encodeNotificationEventSse)),
        Stream.tick("15 seconds").pipe(Stream.as(encodeSseChunk(": keep-alive"))),
      ).pipe(Stream.withSpan("http.events.stream"));

      return Stream.concat(initialEvents, liveEvents);
    }),
  );
}
