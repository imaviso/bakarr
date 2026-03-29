import { assert, assertEquals, assertExists, it } from "@/test/vitest.ts";
import { Effect, Exit, Fiber, Stream, TestClock } from "effect";

import { makeEventBus } from "@/features/events/event-bus.ts";

it.effect("event bus fans out events to active subscribers", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const eventBus = yield* makeEventBus({ capacity: 8 });
      const first = yield* eventBus.subscribe();
      const second = yield* eventBus.subscribe();
      const event = { type: "Info", payload: { message: "hello" } } as const;

      yield* eventBus.publish(event);

      const firstEvent = yield* first.take;
      const secondEvent = yield* second.take;

      assertEquals(
        [firstEvent, secondEvent],
        [
          { type: "Info", payload: { message: "hello" } },
          { type: "Info", payload: { message: "hello" } },
        ],
      );
    }),
  ),
);

it.effect("event bus uses sliding backpressure for slow subscribers", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const eventBus = yield* makeEventBus({ capacity: 2 });
      const subscription = yield* eventBus.subscribe();

      yield* eventBus.publish({ type: "Info", payload: { message: "one" } });
      yield* eventBus.publish({ type: "Info", payload: { message: "two" } });
      yield* eventBus.publish({ type: "Info", payload: { message: "three" } });

      const first = yield* subscription.take;
      const second = yield* subscription.take;

      assertEquals(
        [first, second],
        [
          { type: "Info", payload: { message: "two" } },
          { type: "Info", payload: { message: "three" } },
        ],
      );
    }),
  ),
);

it.effect("event bus subscriptions expose a stream view", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const eventBus = yield* makeEventBus({ capacity: 8 });
      const subscription = yield* eventBus.subscribe();

      yield* eventBus.publish({ type: "Info", payload: { message: "one" } });
      yield* eventBus.publish({ type: "Info", payload: { message: "two" } });

      const events = yield* Stream.runCollect(subscription.stream.pipe(Stream.take(2)));

      assertEquals(Array.from(events), [
        { type: "Info", payload: { message: "one" } },
        { type: "Info", payload: { message: "two" } },
      ]);
    }),
  ),
);

it.effect("event bus subscriptions are interrupted when the scope closes", () =>
  Effect.gen(function* () {
    const eventBus = yield* makeEventBus({ capacity: 8 });
    const waiting = yield* Effect.scoped(
      eventBus
        .subscribe()
        .pipe(Effect.flatMap((subscription) => subscription.take.pipe(Effect.forkScoped))),
    );

    const timed = yield* Fiber.await(waiting).pipe(Effect.timeout("1 second"), Effect.fork);
    yield* TestClock.adjust("1 second");
    const exit = yield* Fiber.join(timed);

    assertExists(exit);
    assert(Exit.isInterrupted(exit));
  }),
);
