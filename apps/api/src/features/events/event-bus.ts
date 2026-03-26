import { Context, Effect, Exit, Layer, PubSub, Queue, Scope, Stream } from "effect";

import type { NotificationEvent } from "../../../../../packages/shared/src/index.ts";

export const DEFAULT_EVENT_BUS_CAPACITY = 256;

export interface EventSubscription {
  readonly close: Effect.Effect<void>;
  readonly stream: Stream.Stream<NotificationEvent>;
  readonly take: Effect.Effect<NotificationEvent, unknown>;
}

export interface EventBusShape {
  readonly publish: (event: NotificationEvent) => Effect.Effect<void>;
  readonly subscribe: () => Effect.Effect<EventSubscription>;
}

export class EventBus extends Context.Tag("@bakarr/api/EventBus")<EventBus, EventBusShape>() {}

export function makeEventBus(options: { readonly capacity?: number } = {}) {
  const capacity = options.capacity ?? DEFAULT_EVENT_BUS_CAPACITY;

  return Effect.gen(function* () {
    const pubsub = yield* PubSub.sliding<NotificationEvent>(capacity);
    const publish = Effect.fn("EventBus.publish")(function* (event: NotificationEvent) {
      yield* PubSub.publish(pubsub, event);
    });
    const subscribe = Effect.fn("EventBus.subscribe")(function* () {
      const scope = yield* Scope.make();
      const pubsubQueue = yield* PubSub.subscribe(pubsub).pipe(Scope.extend(scope));
      const slidingQueue = yield* Queue.sliding<NotificationEvent>(capacity);

      yield* Queue.take(pubsubQueue).pipe(
        Effect.flatMap((event) => Queue.offer(slidingQueue, event)),
        Effect.forever,
        Effect.forkIn(scope),
      );

      return {
        close: Queue.shutdown(slidingQueue).pipe(
          Effect.zipRight(Scope.close(scope, Exit.succeed(void 0))),
        ),
        stream: Stream.fromQueue(slidingQueue, { shutdown: false }),
        take: Queue.take(slidingQueue),
      } satisfies EventSubscription;
    });

    return {
      publish,
      subscribe,
    } satisfies EventBusShape;
  });
}

export const EventBusLive = Layer.effect(EventBus, makeEventBus());
