import type { NotificationEvent } from "@packages/shared/index.ts";
import { Context, Effect, Layer, PubSub, Stream } from "effect";

export const DEFAULT_EVENT_BUS_CAPACITY = 1024;

/**
 * Subscription view over the event bus.
 *
 * Call `takeBufferedOnce` after bootstrap work that may publish events and
 * before consuming `stream` when you want events published after subscription
 * folded into an initial snapshot without duplicating them.
 */
export interface EventSubscription {
  readonly takeBufferedOnce: Effect.Effect<readonly NotificationEvent[]>;
  readonly stream: Stream.Stream<NotificationEvent>;
}

export interface EventBusShape {
  readonly publish: (event: NotificationEvent) => Effect.Effect<void>;
  readonly publishInfo: (message: string) => Effect.Effect<void>;
  readonly withSubscriptionStream: <A, E>(
    use: (subscription: EventSubscription) => Stream.Stream<A, E>,
  ) => Stream.Stream<A, E>;
}

export class EventBus extends Context.Service<EventBus, EventBusShape>()("@bakarr/api/EventBus") {
  static readonly layer = Layer.effect(
    EventBus,
    Effect.gen(function* () {
      const pubsub = yield* PubSub.sliding<NotificationEvent>({
        capacity: DEFAULT_EVENT_BUS_CAPACITY,
      });
      yield* Effect.addFinalizer(() => PubSub.shutdown(pubsub));
      return makeEventBusFromPubSub(pubsub);
    }),
  );
}

const makeEventBusFromPubSub = (pubsub: PubSub.PubSub<NotificationEvent>) =>
  ({
    publish: Effect.fn("EventBus.publish")(function* (event: NotificationEvent) {
      yield* PubSub.publish(pubsub, event);
    }),
    publishInfo: Effect.fn("EventBus.publishInfo")(function* (message: string) {
      yield* PubSub.publish(pubsub, {
        type: "Info",
        payload: { message },
      });
    }),
    withSubscriptionStream: <A, E>(
      use: (subscription: EventSubscription) => Stream.Stream<A, E>,
    ): Stream.Stream<A, E> =>
      Stream.unwrap(
        Effect.gen(function* () {
          const subscription = yield* PubSub.subscribe(pubsub);
          const takeBufferedOnce = yield* Effect.cached(
            PubSub.takeUpTo(subscription, DEFAULT_EVENT_BUS_CAPACITY).pipe(
              Effect.map((events) => [...events]),
              Effect.withSpan("EventBus.takeBufferedOnce"),
            ),
          );

          return use({
            takeBufferedOnce,
            stream: Stream.fromSubscription(subscription),
          });
        }),
      ),
  }) satisfies EventBusShape;

export const makeEventBus = Effect.fn("Events.makeEventBus")(
  (options: { readonly capacity?: number } = {}) =>
    Effect.gen(function* () {
      const capacity = options.capacity ?? DEFAULT_EVENT_BUS_CAPACITY;
      const pubsub = yield* PubSub.sliding<NotificationEvent>({ capacity });
      return EventBus.of(makeEventBusFromPubSub(pubsub));
    }),
);

export const EventBusNoopLive = Layer.succeed(
  EventBus,
  EventBus.of({
    publish: () => Effect.void,
    publishInfo: () => Effect.void,
    withSubscriptionStream: <A, E>(use: (subscription: EventSubscription) => Stream.Stream<A, E>) =>
      use({
        takeBufferedOnce: Effect.succeed([]),
        stream: Stream.empty,
      }),
  }),
);
