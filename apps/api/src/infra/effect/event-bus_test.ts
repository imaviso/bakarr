import * as TestClock from "effect/testing/TestClock";
import { Cause, Deferred, Effect, Exit, Fiber, Stream } from "effect";
import { assert, it } from "@effect/vitest";

import type { NotificationEvent } from "@packages/shared/index.ts";
import { type EventSubscription, makeEventBus } from "@/infra/effect/event-bus.ts";

it.effect("event bus fans out events to active subscribers", () =>
  Effect.gen(function* () {
    const eventBus = yield* makeEventBus({ capacity: 8 });
    const firstReady = yield* Deferred.make<void>();
    const secondReady = yield* Deferred.make<void>();
    const firstStream = eventBus.withSubscriptionStream((subscription: EventSubscription) =>
      Stream.unwrap(Deferred.succeed(firstReady, void 0).pipe(Effect.as(subscription.stream))),
    );
    const secondStream = eventBus.withSubscriptionStream((subscription: EventSubscription) =>
      Stream.unwrap(Deferred.succeed(secondReady, void 0).pipe(Effect.as(subscription.stream))),
    );
    const event: NotificationEvent = { type: "Info", payload: { message: "hello" } };

    const firstFiber = yield* Effect.forkChild(takeNextEvent(firstStream));
    const secondFiber = yield* Effect.forkChild(takeNextEvent(secondStream));
    yield* Deferred.await(firstReady);
    yield* Deferred.await(secondReady);

    yield* eventBus.publish(event);

    const firstEvent = yield* Fiber.join(firstFiber);
    const secondEvent = yield* Fiber.join(secondFiber);

    assert.deepStrictEqual(
      [firstEvent, secondEvent],
      [
        { type: "Info", payload: { message: "hello" } },
        { type: "Info", payload: { message: "hello" } },
      ],
    );
  }),
);

it.effect("event bus uses sliding backpressure for slow subscribers", () =>
  Effect.gen(function* () {
    const eventBus = yield* makeEventBus({ capacity: 2 });
    const ready = yield* Deferred.make<void>();
    const release = yield* Deferred.make<void>();
    const stream = eventBus.withSubscriptionStream((subscription: EventSubscription) =>
      Stream.unwrap(
        Deferred.succeed(ready, void 0).pipe(
          Effect.andThen(Deferred.await(release)),
          Effect.as(subscription.stream),
        ),
      ),
    );
    const eventsFiber = yield* Effect.forkChild(Stream.runCollect(stream.pipe(Stream.take(2))));
    yield* Deferred.await(ready);

    yield* eventBus.publish({ type: "Info", payload: { message: "one" } });
    yield* eventBus.publish({ type: "Info", payload: { message: "two" } });
    yield* eventBus.publish({ type: "Info", payload: { message: "three" } });
    yield* Deferred.succeed(release, void 0);

    const events = yield* Fiber.join(eventsFiber);

    assert.deepStrictEqual(Array.from(events), [
      { type: "Info", payload: { message: "two" } },
      { type: "Info", payload: { message: "three" } },
    ]);
  }),
);

it.effect("event bus subscriptions expose a stream view", () =>
  Effect.gen(function* () {
    const eventBus = yield* makeEventBus({ capacity: 8 });
    const ready = yield* Deferred.make<void>();
    const stream = eventBus.withSubscriptionStream((subscription: EventSubscription) =>
      Stream.unwrap(Deferred.succeed(ready, void 0).pipe(Effect.as(subscription.stream))),
    );
    const eventsFiber = yield* Effect.forkChild(Stream.runCollect(stream.pipe(Stream.take(2))));
    yield* Deferred.await(ready);

    yield* eventBus.publish({ type: "Info", payload: { message: "one" } });
    yield* eventBus.publish({ type: "Info", payload: { message: "two" } });

    const events = yield* Fiber.join(eventsFiber);

    assert.deepStrictEqual(Array.from(events), [
      { type: "Info", payload: { message: "one" } },
      { type: "Info", payload: { message: "two" } },
    ]);
  }),
);

it.effect("event bus subscriptions are interrupted when the scope closes", () =>
  Effect.gen(function* () {
    const eventBus = yield* makeEventBus({ capacity: 8 });
    const stream = eventBus.withSubscriptionStream(
      (subscription: EventSubscription) => subscription.stream,
    );
    const waiting = yield* Effect.scoped(
      Stream.runCollect(stream.pipe(Stream.take(1))).pipe(Effect.forkScoped),
    );

    const timed = yield* Fiber.await(waiting).pipe(Effect.timeout("1 second"), Effect.forkChild);
    yield* TestClock.adjust("1 second");
    const exit = yield* Fiber.join(timed);

    assert.ok(exit);
    assert.ok(Exit.isFailure(exit) && Cause.hasInterruptsOnly(exit.cause));
  }),
);

it.effect("event bus does not replay events published before subscription", () =>
  Effect.gen(function* () {
    const eventBus = yield* makeEventBus({ capacity: 8 });
    yield* eventBus.publish({ type: "Info", payload: { message: "old" } });

    const ready = yield* Deferred.make<void>();
    const stream = eventBus.withSubscriptionStream((subscription: EventSubscription) =>
      Stream.unwrap(
        Effect.gen(function* () {
          const bufferedEvents = yield* subscription.takeBufferedOnce;
          assert.deepStrictEqual(bufferedEvents, []);
          yield* Deferred.succeed(ready, void 0);
          return subscription.stream;
        }),
      ),
    );

    const fiber = yield* Effect.forkChild(Stream.runCollect(stream.pipe(Stream.take(1))));
    yield* Deferred.await(ready);

    const liveEvent: NotificationEvent = { type: "Info", payload: { message: "live" } };
    yield* eventBus.publish(liveEvent);

    const events = yield* Fiber.join(fiber);

    assert.deepStrictEqual(Array.from(events), [liveEvent]);
  }),
);

it.effect("event bus buffers events published during subscription bootstrap", () =>
  Effect.gen(function* () {
    const eventBus = yield* makeEventBus({ capacity: 8 });
    const subscribed = yield* Deferred.make<void>();
    const releaseBootstrap = yield* Deferred.make<void>();
    const bufferedTaken = yield* Deferred.make<void>();
    const bootstrapEvent: NotificationEvent = {
      type: "Info",
      payload: { message: "bootstrap" },
    };

    const stream = eventBus.withSubscriptionStream((subscription: EventSubscription) =>
      Stream.unwrap(
        Effect.gen(function* () {
          yield* Deferred.succeed(subscribed, void 0);
          yield* Deferred.await(releaseBootstrap);
          const bufferedEvents = yield* subscription.takeBufferedOnce;
          assert.deepStrictEqual(bufferedEvents, [bootstrapEvent]);
          yield* Deferred.succeed(bufferedTaken, void 0);
          return subscription.stream;
        }),
      ),
    );

    const fiber = yield* Effect.forkChild(Stream.runCollect(stream.pipe(Stream.take(1))));
    yield* Deferred.await(subscribed);
    yield* eventBus.publish(bootstrapEvent);
    yield* Deferred.succeed(releaseBootstrap, void 0);
    yield* Deferred.await(bufferedTaken);

    const liveEvent: NotificationEvent = { type: "Info", payload: { message: "live" } };
    yield* eventBus.publish(liveEvent);

    const events = yield* Fiber.join(fiber);

    assert.deepStrictEqual(Array.from(events), [liveEvent]);
  }),
);

const takeNextEvent = <A>(stream: Stream.Stream<A>) =>
  Stream.runCollect(stream.pipe(Stream.take(1))).pipe(
    Effect.map((events) => Array.from(events)[0]),
    Effect.flatMap((event) =>
      event === undefined ? Effect.die(new Error("expected one event")) : Effect.succeed(event),
    ),
  );
