import { assert, it } from "@effect/vitest";
import { Deferred, Effect, Exit, Fiber, Stream, TestClock } from "effect";

import { type EventSubscription, makeEventBus } from "@/features/events/event-bus.ts";

it.scoped("event bus fans out events to active subscribers", () =>
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
    const event = { type: "Info", payload: { message: "hello" } } as const;

    const firstFiber = yield* Effect.fork(takeNextEvent(firstStream));
    const secondFiber = yield* Effect.fork(takeNextEvent(secondStream));
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

it.scoped("event bus uses sliding backpressure for slow subscribers", () =>
  Effect.gen(function* () {
    const eventBus = yield* makeEventBus({ capacity: 2 });
    const ready = yield* Deferred.make<void>();
    const release = yield* Deferred.make<void>();
    const stream = eventBus.withSubscriptionStream((subscription: EventSubscription) =>
      Stream.unwrap(
        Deferred.succeed(ready, void 0).pipe(
          Effect.zipRight(Deferred.await(release)),
          Effect.as(subscription.stream),
        ),
      ),
    );
    const eventsFiber = yield* Effect.fork(Stream.runCollect(stream.pipe(Stream.take(2))));
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

it.scoped("event bus subscriptions expose a stream view", () =>
  Effect.gen(function* () {
    const eventBus = yield* makeEventBus({ capacity: 8 });
    const ready = yield* Deferred.make<void>();
    const stream = eventBus.withSubscriptionStream((subscription: EventSubscription) =>
      Stream.unwrap(Deferred.succeed(ready, void 0).pipe(Effect.as(subscription.stream))),
    );
    const eventsFiber = yield* Effect.fork(Stream.runCollect(stream.pipe(Stream.take(2))));
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

    const timed = yield* Fiber.await(waiting).pipe(Effect.timeout("1 second"), Effect.fork);
    yield* TestClock.adjust("1 second");
    const exit = yield* Fiber.join(timed);

    assert.ok(exit);
    assert.ok(Exit.isInterrupted(exit));
  }),
);

const takeNextEvent = <A>(stream: Stream.Stream<A>) =>
  Stream.runCollect(stream.pipe(Stream.take(1))).pipe(
    Effect.map((events) => Array.from(events)[0]),
    Effect.flatMap((event) =>
      event === undefined ? Effect.die("expected one event") : Effect.succeed(event),
    ),
  );
