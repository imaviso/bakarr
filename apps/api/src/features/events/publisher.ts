import { Context, Effect, Layer } from "effect";

import type { NotificationEvent } from "@packages/shared/index.ts";
import { EventBus } from "@/features/events/event-bus.ts";

export interface EventPublisherShape {
  readonly publish: (event: NotificationEvent) => Effect.Effect<void, never, never>;
  readonly publishInfo: (message: string) => Effect.Effect<void, never, never>;
}

export class EventPublisher extends Context.Tag("@bakarr/api/EventPublisher")<
  EventPublisher,
  EventPublisherShape
>() {}

export const makeEventPublisher = Effect.fn("Events.makeEventPublisher")((options?: {
  readonly publish?: (event: NotificationEvent) => Effect.Effect<void, never, never>;
}) => {
  return Effect.gen(function* () {
    const publishEvent = options?.publish ?? (yield* EventBus).publish;
    const publish = Effect.fn("EventPublisher.publish")(function* (event: NotificationEvent) {
      yield* publishEvent(event);
    });
    const publishInfo = Effect.fn("EventPublisher.publishInfo")(function* (message: string) {
      yield* publishEvent({
        type: "Info",
        payload: { message },
      });
    });

    return {
      publish,
      publishInfo,
    } satisfies EventPublisherShape;
  });
});

export const EventPublisherLive = Layer.effect(EventPublisher, makeEventPublisher());
