import { assertEquals, assertInstanceOf, it } from "../../test/vitest.ts";
import { Deferred, Effect, Fiber, Layer, Ref, TestClock } from "effect";

import { DatabaseError } from "../../db/database.ts";
import { ClockServiceLive } from "../../lib/clock.ts";
import { makeUnusedEventBusLayer } from "../../test/event-bus-stub.ts";
import { makeEventPublisher } from "../events/publisher.ts";
import {
  AnimeConflictError,
  AnimeNotFoundError,
  AnimePathError,
} from "./errors.ts";
import {
  tryAnimePromise,
  tryDatabasePromise,
  wrapAnimeError,
} from "./service-support.ts";

it.effect("anime service support preserves known errors and wraps unknown ones", () =>
  Effect.gen(function* () {
    const knownNotFound = new AnimeNotFoundError({ message: "missing" });
    const knownConflict = new AnimeConflictError({ message: "conflict" });
    const knownPath = new AnimePathError({ message: "path" });
    const knownDb = new DatabaseError({ cause: new Error("db"), message: "db" });

    assertEquals(wrapAnimeError("ignored")(knownNotFound), knownNotFound);
    assertEquals(wrapAnimeError("ignored")(knownConflict), knownConflict);
    assertEquals(wrapAnimeError("ignored")(knownPath), knownPath);
    assertEquals(wrapAnimeError("ignored")(knownDb), knownDb);

    const wrapped = wrapAnimeError("wrapped")(new Error("boom"));
    assertInstanceOf(wrapped, DatabaseError);
    assertEquals(wrapped.message, "wrapped");

    const dbExit = yield* Effect.exit(
      tryDatabasePromise("db failed", () => Promise.reject(new Error("boom"))),
    );
    assertEquals(dbExit._tag, "Failure");

    const animeExit = yield* Effect.exit(
      tryAnimePromise("anime failed", () => Promise.reject(new Error("boom"))),
    );
    assertEquals(animeExit._tag, "Failure");
  })
);

it.scoped("anime service support can publish coalesced info messages", () =>
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

    const first = yield* Effect.fork(publisher.publishInfo("first"));
    const second = yield* Effect.fork(publisher.publishInfo("second"));
    yield* TestClock.adjust("300 millis");
    yield* Deferred.await(publishedSignal);
    yield* Fiber.await(first);
    yield* Fiber.await(second);
    yield* publisher.shutdown;

    assertEquals(yield* Ref.get(state), ["second"]);
  }).pipe(
    Effect.provide(
      Layer.mergeAll(
        ClockServiceLive,
        makeUnusedEventBusLayer("unused in anime service support test"),
      ),
    ),
  )
);
