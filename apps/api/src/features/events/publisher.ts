import { Context, Effect, Layer } from "effect";

import type { NotificationEvent } from "@packages/shared/index.ts";
import { ClockService } from "@/lib/clock.ts";
import {
  type LatestValuePublisher,
  makeLatestValuePublisher,
} from "@/lib/effect-coalescing-latest-value-publisher.ts";
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

const INFO_EVENT_TOAST_WINDOW_MS = 250;

interface CoalescedInfoEvent {
  readonly event: NotificationEvent;
  readonly emitAt: number;
}

export const makeEventPublisher = Effect.fn("Events.makeEventPublisher")((options?: {
  readonly infoEventToastWindowMs?: number;
  readonly publish?: (event: NotificationEvent) => Effect.Effect<void>;
}) => {
  const infoEventToastWindowMs = options?.infoEventToastWindowMs ?? INFO_EVENT_TOAST_WINDOW_MS;

  return Effect.gen(function* () {
    const publishEvent = options?.publish ?? (yield* EventBus).publish;
    const clock = yield* ClockService;
    const infoPublisher: LatestValuePublisher<CoalescedInfoEvent, never, never> =
      yield* makeLatestValuePublisher<CoalescedInfoEvent, never, never>((value) =>
        Effect.gen(function* () {
          const now = yield* clock.currentTimeMillis;
          const remainingMs = value.emitAt - now;

          if (remainingMs > 0) {
            yield* Effect.sleep(`${remainingMs} millis`);
          }

          yield* publishEvent(value.event);
        }),
      );
    const publish = Effect.fn("EventPublisher.publish")(function* (event: NotificationEvent) {
      yield* publishEvent(event);
    });
    const publishInfo = Effect.fn("EventPublisher.publishInfo")(function* (message: string) {
      const now = yield* clock.currentTimeMillis;

      yield* infoPublisher.offer({
        emitAt: now + infoEventToastWindowMs,
        event: {
          type: "Info",
          payload: { message },
        },
      });
    });

    return {
      publish,
      publishInfo,
      shutdown: infoPublisher.shutdown,
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
