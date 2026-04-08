import { Context, Effect, Layer, PubSub, Queue, Ref, Scope, Stream } from "effect";

import type { NotificationEvent } from "@packages/shared/index.ts";

export const DEFAULT_EVENT_BUS_CAPACITY = 256;

export interface EventSubscription {
  readonly takeBuffered: Effect.Effect<readonly NotificationEvent[]>;
  readonly stream: Stream.Stream<NotificationEvent>;
}

export interface EventBusShape {
  readonly publish: (event: NotificationEvent) => Effect.Effect<void>;
  readonly subscribe: () => Effect.Effect<EventSubscription, never, Scope.Scope>;
}

export class EventBus extends Context.Tag("@bakarr/api/EventBus")<EventBus, EventBusShape>() {}

export const makeEventBus = Effect.fn("Events.makeEventBus")((
  options: { readonly capacity?: number } = {},
) => {
  const capacity = options.capacity ?? DEFAULT_EVENT_BUS_CAPACITY;

  return Effect.gen(function* () {
    const pubsub = yield* PubSub.sliding<NotificationEvent>(capacity);
    const publish = Effect.fn("EventBus.publish")(function* (event: NotificationEvent) {
      yield* PubSub.publish(pubsub, event);
    });
    const subscribe = Effect.fn("EventBus.subscribe")(function* () {
      const scope = yield* Scope.Scope;
      const pubsubQueue = yield* PubSub.subscribe(pubsub);
      const slidingQueue = yield* Effect.acquireRelease(
        Queue.sliding<NotificationEvent>(capacity),
        Queue.shutdown,
      );

      const initializationLock = yield* Effect.makeSemaphore(1);
      const initializedRef = yield* Ref.make(false);

      const initialize = Effect.fn("EventBus.initializeSubscription")(function* () {
        yield* initializationLock.withPermits(1)(
          Effect.gen(function* () {
            const initialized = yield* Ref.get(initializedRef);

            if (initialized) {
              return;
            }

            const pending = yield* Queue.takeAll(pubsubQueue);

            yield* Effect.forEach(pending, (event) => Queue.offer(slidingQueue, event), {
              discard: true,
            });

            yield* Queue.take(pubsubQueue).pipe(
              Effect.flatMap((event) => Queue.offer(slidingQueue, event)),
              Effect.forever,
              Effect.forkIn(scope),
            );

            yield* Ref.set(initializedRef, true);
          }),
        );
      });

      return {
        takeBuffered: initialize().pipe(
          Effect.zipRight(Queue.takeAll(slidingQueue)),
          Effect.map((events) => Array.from(events)),
        ),
        stream: Stream.unwrapScoped(
          initialize().pipe(Effect.as(Stream.fromQueue(slidingQueue, { shutdown: false }))),
        ),
      } satisfies EventSubscription;
    });

    return {
      publish,
      subscribe,
    } satisfies EventBusShape;
  });
});

export const EventBusLive = Layer.effect(EventBus, makeEventBus());
