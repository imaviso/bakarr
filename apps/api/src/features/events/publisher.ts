import { Clock, Context, Effect, Layer } from "effect";

import type { NotificationEvent } from "../../../../../packages/shared/src/index.ts";
import {
  type LatestValuePublisher,
  makeLatestValuePublisher,
} from "../../lib/effect-coalescing.ts";
import { EventBus } from "./event-bus.ts";

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

export function makeEventPublisher(options?: {
  readonly infoEventToastWindowMs?: number;
  readonly publish?: (event: NotificationEvent) => Effect.Effect<void>;
}) {
  const infoEventToastWindowMs = options?.infoEventToastWindowMs ??
    INFO_EVENT_TOAST_WINDOW_MS;

  return Effect.gen(function* () {
    const publish = options?.publish ?? (yield* EventBus).publish;
    const infoPublisher: LatestValuePublisher<
      CoalescedInfoEvent,
      never,
      never
    > = yield* makeLatestValuePublisher<CoalescedInfoEvent, never, never>((
      value,
    ) =>
      Effect.gen(function* () {
        const now = yield* Clock.currentTimeMillis;
        const remainingMs = value.emitAt - now;

        if (remainingMs > 0) {
          yield* Effect.sleep(`${remainingMs} millis`);
        }

        yield* publish(value.event);
      })
    );

    return {
      publish,
      publishInfo: (message: string) =>
        Effect.gen(function* () {
          const now = yield* Clock.currentTimeMillis;

          yield* infoPublisher.offer({
            emitAt: now + infoEventToastWindowMs,
            event: {
              type: "Info",
              payload: { message },
            },
          });
        }),
      shutdown: infoPublisher.shutdown,
    } satisfies ManagedEventPublisher;
  });
}

export const EventPublisherLive = Layer.scoped(
  EventPublisher,
  Effect.gen(function* () {
    const publisher = yield* makeEventPublisher();
    yield* Effect.addFinalizer(() => publisher.shutdown);
    return publisher;
  }),
);
