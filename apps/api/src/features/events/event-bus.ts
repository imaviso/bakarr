import { Context, Effect, Exit, Layer, PubSub, Queue, Ref, Scope, Stream } from "effect";

import type { NotificationEvent } from "@packages/shared/index.ts";

export const DEFAULT_EVENT_BUS_CAPACITY = 256;

export interface EventSubscription {
  readonly takeBuffered: Effect.Effect<readonly NotificationEvent[]>;
  readonly stream: Stream.Stream<NotificationEvent>;
}

export interface EventBusShape {
  readonly publish: (event: NotificationEvent) => Effect.Effect<void>;
  readonly subscribe: () => Effect.Effect<EventSubscription>;
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
      const subscriptionScope = yield* Scope.make();
      const pubsubQueue = yield* PubSub.subscribe(pubsub).pipe(
        Effect.provideService(Scope.Scope, subscriptionScope),
      );
      const slidingQueue = yield* Queue.sliding<NotificationEvent>(capacity);

      const initializationLock = yield* Effect.makeSemaphore(1);
      const initializedRef = yield* Ref.make(false);
      const bufferedRef = yield* Ref.make<readonly NotificationEvent[]>([]);

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
              Effect.forkIn(subscriptionScope),
            );

            yield* Ref.set(bufferedRef, Array.from(pending));
            yield* Ref.set(initializedRef, true);
          }),
        );
      });

      return {
        takeBuffered: initialize().pipe(
          Effect.zipRight(Ref.get(bufferedRef)),
          Effect.map((events) => Array.from(events)),
        ),
        stream: Stream.unwrapScoped(
          initialize().pipe(
            Effect.as(
              Stream.fromQueue(slidingQueue, { shutdown: false }).pipe(
                Stream.ensuring(Queue.shutdown(slidingQueue)),
                Stream.ensuring(Scope.close(subscriptionScope, Exit.void)),
              ),
            ),
          ),
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
