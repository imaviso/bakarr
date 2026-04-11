import { Context, Effect, Layer } from "effect";

import type { NotificationEvent } from "@packages/shared/index.ts";
import { EventBus } from "@/features/events/event-bus.ts";

export interface EventPublisherShape {
  readonly publish: (event: NotificationEvent) => Effect.Effect<void>;
  readonly publishInfo: (message: string) => Effect.Effect<void>;
}

interface ManagedEventPublisher extends EventPublisherShape {
  readonly shutdown: Effect.Effect<void>;
}

export class EventPublisher extends Context.Tag("@bakarr/api/EventPublisher")<
  EventPublisher,
  EventPublisherShape
>() {}

export const makeEventPublisher = Effect.fn("Events.makeEventPublisher")((options?: {
  readonly publish?: (event: NotificationEvent) => Effect.Effect<void>;
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
      shutdown: Effect.void,
    } satisfies ManagedEventPublisher;
  });
});

export const EventPublisherLive = Layer.scoped(
  EventPublisher,
  Effect.gen(function* () {
    const publisher = yield* makeEventPublisher();
    yield* Effect.addFinalizer(() => publisher.shutdown);
    return publisher;
  }),
);
