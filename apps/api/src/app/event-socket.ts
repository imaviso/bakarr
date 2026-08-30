import { Effect, Schema } from "effect";

import { encodeNotificationEventWire, type NotificationEvent } from "@packages/shared/index.ts";

export class NotificationEventEncodeError extends Schema.TaggedError<NotificationEventEncodeError>()(
  "NotificationEventEncodeError",
  {
    cause: Schema.optional(Schema.Defect),
    message: Schema.String,
  },
) {}

export const encodeNotificationEventJson = Effect.fn("Http.encodeNotificationEventJson")(function* (
  event: NotificationEvent,
) {
  return yield* encodeNotificationEventWire(event).pipe(
    Effect.mapError(
      (cause) =>
        new NotificationEventEncodeError({
          cause,
          message: "Notification event could not be encoded for WebSocket",
        }),
    ),
  );
});
