import { assert, it } from "@effect/vitest";
import { Effect, Layer, Ref } from "effect";

import { makeUnusedEventBusLayer } from "@/test/event-bus-stub.ts";
import { makeEventPublisher } from "@/features/events/publisher.ts";

it.scoped("event publisher emits each info message in order", () =>
  Effect.gen(function* () {
    const state = yield* Ref.make<string[]>([]);
    const publisher = yield* makeEventPublisher({
      publish: (event) =>
        Ref.update(state, (current) => [
          ...current,
          event.type === "Info" ? event.payload.message : event.type,
        ]),
    });

    yield* publisher.publishInfo("one");
    yield* publisher.publishInfo("two");
    yield* publisher.publishInfo("three");
    yield* publisher.shutdown;

    assert.deepStrictEqual(yield* Ref.get(state), ["one", "two", "three"]);
  }).pipe(Effect.provide(Layer.mergeAll(makeUnusedEventBusLayer("unused in publisher test")))),
);
