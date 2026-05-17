import { Cause, Effect, Exit } from "effect";

import { assert, it } from "@effect/vitest";
import { StreamRangeError } from "@/features/media/stream/media-stream-errors.ts";
import { parseStreamRange } from "@/http/media/streaming-range.ts";

it.effect("parses absolute and open-ended stream ranges", () =>
  Effect.gen(function* () {
    const absolute = yield* parseStreamRange("bytes=10-19", 100);
    const fullFile = yield* parseStreamRange("bytes=0-99", 100);
    const openEnded = yield* parseStreamRange("bytes=10-", 100);

    assert.deepStrictEqual(absolute, { start: 10, end: 19 });
    assert.deepStrictEqual(fullFile, { start: 0, end: 99 });
    assert.deepStrictEqual(openEnded, { start: 10, end: 99 });
  }),
);

it.effect("parses suffix stream ranges", () =>
  Effect.gen(function* () {
    const suffix = yield* parseStreamRange("bytes=-10", 100);

    assert.deepStrictEqual(suffix, { start: 90, end: 99 });
  }),
);

it.effect("rejects invalid stream ranges", () =>
  Effect.gen(function* () {
    const exit = yield* Effect.exit(parseStreamRange("bytes=-0", 100));
    const inverted = yield* Effect.exit(parseStreamRange("bytes=20-10", 100));
    const multi = yield* Effect.exit(parseStreamRange("bytes=0-1,2-3", 100));
    const nonByte = yield* Effect.exit(parseStreamRange("items=0-1", 100));

    assert.deepStrictEqual(Exit.isFailure(exit), true);
    assert.deepStrictEqual(Exit.isFailure(inverted), true);
    assert.deepStrictEqual(Exit.isFailure(multi), true);
    assert.deepStrictEqual(Exit.isFailure(nonByte), true);

    for (const failureExit of [exit, inverted, multi, nonByte]) {
      if (Exit.isFailure(failureExit)) {
        const failure = Cause.failureOption(failureExit.cause);
        assert.deepStrictEqual(failure._tag, "Some");
        if (failure._tag === "Some") {
          assert.deepStrictEqual(failure.value instanceof StreamRangeError, true);
          assert.deepStrictEqual(failure.value.status, 416);
        }
      }
    }
  }),
);
