import { assertEquals, it } from "../../test/vitest.ts";
import { Effect, Stream } from "effect";

import { makeEventBus } from "./event-bus.ts";

it.effect("event bus fans out events to active subscribers", () =>
  Effect.gen(function* () {
    const eventBus = yield* makeEventBus({ capacity: 8 });
    const first = yield* eventBus.subscribe();
    const second = yield* eventBus.subscribe();
    const event = { type: "Info", payload: { message: "hello" } } as const;

    yield* eventBus.publish(event);

    const firstEvent = yield* first.take;
    const secondEvent = yield* second.take;

    yield* first.close;
    yield* second.close;

    assertEquals(
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
    const subscription = yield* eventBus.subscribe();

    yield* eventBus.publish({ type: "Info", payload: { message: "one" } });
    yield* eventBus.publish({ type: "Info", payload: { message: "two" } });
    yield* eventBus.publish({ type: "Info", payload: { message: "three" } });

    const first = yield* subscription.take;
    const second = yield* subscription.take;

    yield* subscription.close;

    assertEquals(
      [first, second],
      [
        { type: "Info", payload: { message: "two" } },
        { type: "Info", payload: { message: "three" } },
      ],
    );
  }),
);

it.effect("event bus subscriptions expose a stream view", () =>
  Effect.gen(function* () {
    const eventBus = yield* makeEventBus({ capacity: 8 });
    const subscription = yield* eventBus.subscribe();

    yield* eventBus.publish({ type: "Info", payload: { message: "one" } });
    yield* eventBus.publish({ type: "Info", payload: { message: "two" } });

    const events = yield* Stream.runCollect(subscription.stream.pipe(Stream.take(2)));

    yield* subscription.close;

    assertEquals(Array.from(events), [
      { type: "Info", payload: { message: "one" } },
      { type: "Info", payload: { message: "two" } },
    ]);
  }),
);
