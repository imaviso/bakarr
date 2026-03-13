import { assertEquals } from "@std/assert";
import { Effect } from "effect";

import { runTestEffect } from "../../test/effect-test.ts";
import { makeEventBus } from "./event-bus.ts";

Deno.test("event bus fans out events to active subscribers", async () => {
  const received = await runTestEffect(
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

      return [firstEvent, secondEvent] as const;
    }),
  );

  assertEquals(received, [
    { type: "Info", payload: { message: "hello" } },
    { type: "Info", payload: { message: "hello" } },
  ]);
});

Deno.test("event bus uses sliding backpressure for slow subscribers", async () => {
  const received = await runTestEffect(
    Effect.gen(function* () {
      const eventBus = yield* makeEventBus({ capacity: 2 });
      const subscription = yield* eventBus.subscribe();

      yield* eventBus.publish({ type: "Info", payload: { message: "one" } });
      yield* eventBus.publish({ type: "Info", payload: { message: "two" } });
      yield* eventBus.publish({ type: "Info", payload: { message: "three" } });

      const first = yield* subscription.take;
      const second = yield* subscription.take;

      yield* subscription.close;

      return [first, second] as const;
    }),
  );

  assertEquals(received, [
    { type: "Info", payload: { message: "two" } },
    { type: "Info", payload: { message: "three" } },
  ]);
});
