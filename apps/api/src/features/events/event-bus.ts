import { Context, Effect, Exit, Layer, Option, PubSub, Queue, Ref, Scope, Stream } from "effect";

import type { NotificationEvent } from "@packages/shared/index.ts";

export const DEFAULT_EVENT_BUS_CAPACITY = 256;

export interface EventSubscription {
  readonly takeBufferedOnce: Effect.Effect<readonly NotificationEvent[]>;
  readonly stream: Stream.Stream<NotificationEvent>;
}

export interface EventBusShape {
  readonly publish: (event: NotificationEvent) => Effect.Effect<void>;
  readonly withSubscriptionStream: <A, E>(
    use: (subscription: EventSubscription) => Stream.Stream<A, E>,
  ) => Stream.Stream<A, E>;
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
    const withSubscriptionStream = <A, E>(
      use: (subscription: EventSubscription) => Stream.Stream<A, E>,
    ): Stream.Stream<A, E> =>
      Stream.unwrapScoped(
        Effect.gen(function* () {
          const pubsubQueue = yield* PubSub.subscribe(pubsub);
          const slidingQueue = yield* Effect.acquireRelease(
            Queue.sliding<NotificationEvent>(capacity),
            Queue.shutdown,
          );
          const initializationLock = yield* Effect.makeSemaphore(1);
          const initialBufferedRef = yield* Ref.make<Option.Option<readonly NotificationEvent[]>>(
            Option.none(),
          );
          const relayScope = yield* Scope.make();
          yield* Effect.addFinalizer(() => Scope.close(relayScope, Exit.void));

          const initialize = initializationLock
            .withPermits(1)(
              Effect.gen(function* () {
                const initialized = yield* Ref.get(initialBufferedRef);

                if (Option.isSome(initialized)) {
                  return;
                }

                const pending = yield* Queue.takeAll(pubsubQueue);
                yield* Effect.forEach(pending, (event) => Queue.offer(slidingQueue, event), {
                  discard: true,
                });

                yield* Effect.forkIn(relayScope)(
                  Queue.take(pubsubQueue).pipe(
                    Effect.flatMap((event) => Queue.offer(slidingQueue, event)),
                    Effect.forever,
                  ),
                );

                yield* Ref.set(initialBufferedRef, Option.some(Array.from(pending)));
              }),
            )
            .pipe(Effect.withSpan("EventBus.initializeSubscription"));

          const takeBufferedOnce = initialize.pipe(
            Effect.zipRight(
              Ref.modify(initialBufferedRef, (state) =>
                Option.match(state, {
                  onNone: () => [[], Option.none()] as const,
                  onSome: (events) => [events, Option.none()] as const,
                }),
              ),
            ),
          );

          const subscription = {
            takeBufferedOnce,
            stream: Stream.unwrap(
              initialize.pipe(Effect.as(Stream.fromQueue(slidingQueue, { shutdown: false }))),
            ),
          } satisfies EventSubscription;

          return use(subscription);
        }),
      );

    return {
      publish,
      withSubscriptionStream,
    } satisfies EventBusShape;
  });
});

export const EventBusLive = Layer.effect(EventBus, makeEventBus());
