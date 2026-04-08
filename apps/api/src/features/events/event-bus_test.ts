import { assert, it } from "@effect/vitest";
import { Effect, Exit, Fiber, Stream, TestClock } from "effect";

import { makeEventBus } from "@/features/events/event-bus.ts";

it.scoped("event bus fans out events to active subscribers", () =>
  Effect.gen(function* () {
    const eventBus = yield* makeEventBus({ capacity: 8 });
    const first = yield* eventBus.subscribe();
    const second = yield* eventBus.subscribe();
    const event = { type: "Info", payload: { message: "hello" } } as const;

    yield* eventBus.publish(event);

    const firstEvent = yield* takeNextEvent(first.stream);
    const secondEvent = yield* takeNextEvent(second.stream);

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
    const subscription = yield* eventBus.subscribe();

    yield* eventBus.publish({ type: "Info", payload: { message: "one" } });
    yield* eventBus.publish({ type: "Info", payload: { message: "two" } });
    yield* eventBus.publish({ type: "Info", payload: { message: "three" } });

    const events = yield* Stream.runCollect(subscription.stream.pipe(Stream.take(2)));

    assert.deepStrictEqual(Array.from(events), [
      { type: "Info", payload: { message: "two" } },
      { type: "Info", payload: { message: "three" } },
    ]);
  }),
);

it.scoped("event bus subscriptions expose a stream view", () =>
  Effect.gen(function* () {
    const eventBus = yield* makeEventBus({ capacity: 8 });
    const subscription = yield* eventBus.subscribe();

    yield* eventBus.publish({ type: "Info", payload: { message: "one" } });
    yield* eventBus.publish({ type: "Info", payload: { message: "two" } });

    const events = yield* Stream.runCollect(subscription.stream.pipe(Stream.take(2)));

    assert.deepStrictEqual(Array.from(events), [
      { type: "Info", payload: { message: "one" } },
      { type: "Info", payload: { message: "two" } },
    ]);
  }),
);

it.effect("event bus subscriptions are interrupted when the scope closes", () =>
  Effect.gen(function* () {
    const eventBus = yield* makeEventBus({ capacity: 8 });
    const waiting = yield* Effect.scoped(
      eventBus
        .subscribe()
        .pipe(
          Effect.flatMap((subscription) =>
            Stream.runCollect(subscription.stream.pipe(Stream.take(1))).pipe(Effect.forkScoped),
          ),
        ),
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
