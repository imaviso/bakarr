import { assertEquals } from "@std/assert";
import { Deferred, Effect, Fiber, Ref, TestClock } from "effect";

import { runTestEffect } from "../../test/effect-test.ts";
import { makeEventPublisher } from "./publisher.ts";

Deno.test("event publisher coalesces rapid info messages to the newest message", async () => {
  const published = await runTestEffect(
    Effect.gen(function* () {
      const state = yield* Ref.make<string[]>([]);
      const publishedSignal = yield* Deferred.make<void>();
      const publisher = yield* makeEventPublisher({
        infoEventToastWindowMs: 250,
        publish: (event) =>
          Ref.update(state, (current) => [
            ...current,
            event.type === "Info" ? event.payload.message : event.type,
          ]).pipe(Effect.zipRight(Deferred.succeed(publishedSignal, void 0))),
      });

      const first = yield* Effect.fork(publisher.publishInfo("one"));
      const second = yield* Effect.fork(publisher.publishInfo("two"));
      const third = yield* Effect.fork(publisher.publishInfo("three"));

      yield* TestClock.adjust("300 millis");
      yield* Deferred.await(publishedSignal);
      yield* Fiber.await(first);
      yield* Fiber.await(second);
      yield* Fiber.await(third);
      yield* publisher.shutdown;

      return yield* Ref.get(state);
    }),
  );

  assertEquals(published, ["three"]);
});
