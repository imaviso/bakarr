import { assert, it } from "@effect/vitest";
import { Effect, Fiber, Ref, Semaphore } from "effect";
import * as TestClock from "effect/testing/TestClock";

import {
  encodeCommandValue,
  reservePacketSlot,
  shouldRetryAniDbCommand,
  type AniDbRequestContext,
} from "@/features/media/metadata/anidb-command-client.ts";
import {
  AniDbSocketPacketError,
  isAniDbPacketTimeout,
} from "@/features/media/metadata/anidb-socket.ts";

function makeRequestContext() {
  return Effect.gen(function* () {
    return {
      nextTagRef: yield* Ref.make(1),
      packetGate: yield* Semaphore.make(1),
      packetTimestampsRef: yield* Ref.make<ReadonlyArray<number>>([]),
      peer: { addresses: new Set(["127.0.0.1"]), port: 9000 },
    } satisfies AniDbRequestContext;
  });
}

it.effect("pacer enforces 2.2s gaps within the burst allowance", () =>
  Effect.gen(function* () {
    const context = yield* makeRequestContext();
    yield* reservePacketSlot(context);

    let secondDone = false;
    const pending = yield* Effect.forkChild(
      reservePacketSlot(context).pipe(
        Effect.andThen(
          Effect.sync(() => {
            secondDone = true;
          }),
        ),
      ),
    );
    yield* Effect.yieldNow;
    assert.deepStrictEqual(secondDone, false);

    yield* TestClock.adjust("2 seconds");
    yield* Effect.yieldNow;
    assert.deepStrictEqual(secondDone, false);

    yield* TestClock.adjust("1 second");
    yield* Fiber.join(pending);
    assert.deepStrictEqual(secondDone, true);
  }),
);

it.effect("pacer switches to 4s gaps after 5 packets per minute", () =>
  Effect.gen(function* () {
    const context = yield* makeRequestContext();

    for (let index = 0; index < 5; index++) {
      yield* reservePacketSlot(context);
      if (index < 4) {
        yield* TestClock.adjust("2.5 seconds");
      }
    }

    let sixthDone = false;
    const pending = yield* Effect.forkChild(
      reservePacketSlot(context).pipe(
        Effect.andThen(
          Effect.sync(() => {
            sixthDone = true;
          }),
        ),
      ),
    );
    yield* Effect.yieldNow;
    assert.deepStrictEqual(sixthDone, false);

    yield* TestClock.adjust("3 seconds");
    yield* Effect.yieldNow;
    assert.deepStrictEqual(sixthDone, false);

    yield* TestClock.adjust("1 second");
    yield* Fiber.join(pending);
    assert.deepStrictEqual(sixthDone, true);
  }),
);

it("encodeCommandValue escapes per the spec content encoding", () => {
  assert.deepStrictEqual(encodeCommandValue("Seikai no Monshou"), "Seikai no Monshou");
  assert.deepStrictEqual(encodeCommandValue("Ash & Pikachu"), "Ash &amp; Pikachu");
  assert.deepStrictEqual(encodeCommandValue("line one\nline two"), "line one<br />line two");
  assert.deepStrictEqual(encodeCommandValue("p@ss:w0rd%"), "p@ss:w0rd%");
});

it("shouldRetryAniDbCommand retries timeouts and resubmit codes once", () => {
  assert.deepStrictEqual(shouldRetryAniDbCommand({ attempt: 0, timedOut: true }), true);
  assert.deepStrictEqual(
    shouldRetryAniDbCommand({ attempt: 0, responseCode: 602, timedOut: false }),
    true,
  );
  assert.deepStrictEqual(
    shouldRetryAniDbCommand({ attempt: 0, responseCode: 604, timedOut: false }),
    true,
  );
  assert.deepStrictEqual(
    shouldRetryAniDbCommand({ attempt: 0, responseCode: 200, timedOut: false }),
    false,
  );
  assert.deepStrictEqual(shouldRetryAniDbCommand({ attempt: 0, timedOut: false }), false);
  assert.deepStrictEqual(shouldRetryAniDbCommand({ attempt: 1, timedOut: true }), false);
  assert.deepStrictEqual(
    shouldRetryAniDbCommand({ attempt: 1, responseCode: 602, timedOut: false }),
    false,
  );
});

it("isAniDbPacketTimeout only matches timeout failures", () => {
  assert.deepStrictEqual(
    isAniDbPacketTimeout(
      new AniDbSocketPacketError({ cause: "timeout", message: "timed out", timeout: true }),
    ),
    true,
  );
  assert.deepStrictEqual(
    isAniDbPacketTimeout(
      new AniDbSocketPacketError({ cause: "io", message: "failed", timeout: false }),
    ),
    false,
  );
  assert.deepStrictEqual(isAniDbPacketTimeout(new Error("nope")), false);
});
