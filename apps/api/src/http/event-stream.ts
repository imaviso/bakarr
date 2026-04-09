import { Effect, Schema, Stream } from "effect";

import { NotificationEventSchema, type NotificationEvent } from "@packages/shared/index.ts";

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

export function buildNotificationEventSseStream<E>(events: Stream.Stream<NotificationEvent, E>) {
  return Stream.concat(
    Stream.fromIterable([encodeSseChunk(": connected")]),
    Stream.merge(
      events.pipe(Stream.mapEffect(encodeNotificationEventSse)),
      Stream.tick("15 seconds").pipe(Stream.as(encodeSseChunk(": keep-alive"))),
    ).pipe(Stream.withSpan("http.events.stream")),
  );
}
