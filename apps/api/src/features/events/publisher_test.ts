import { assertEquals, it } from "../../test/vitest.ts";
import { Deferred, Effect, Fiber, Layer, Ref, TestClock } from "effect";

import { ClockServiceLive } from "../../lib/clock.ts";
import { makeUnusedEventBusLayer } from "../../test/event-bus-stub.ts";
import { makeEventPublisher } from "./publisher.ts";

it.scoped("event publisher coalesces rapid info messages to the newest message", () =>
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

    assertEquals(yield* Ref.get(state), ["three"]);
  }).pipe(
    Effect.provide(
      Layer.mergeAll(
        ClockServiceLive,
        makeUnusedEventBusLayer("unused in publisher test"),
      ),
    ),
  )
);
