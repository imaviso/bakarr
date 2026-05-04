import { Cause, Effect, Exit } from "effect";

import { assert, it } from "@effect/vitest";
import { EpisodeStreamRangeError } from "@/features/anime/anime-stream-errors.ts";
import { parseEpisodeStreamRange } from "@/http/anime/streaming-range.ts";

it.effect("parses absolute and open-ended episode stream ranges", () =>
  Effect.gen(function* () {
    const absolute = yield* parseEpisodeStreamRange("bytes=10-19", 100);
    const fullFile = yield* parseEpisodeStreamRange("bytes=0-99", 100);
    const openEnded = yield* parseEpisodeStreamRange("bytes=10-", 100);

    assert.deepStrictEqual(absolute, { start: 10, end: 19 });
    assert.deepStrictEqual(fullFile, { start: 0, end: 99 });
    assert.deepStrictEqual(openEnded, { start: 10, end: 99 });
  }),
);

it.effect("parses suffix episode stream ranges", () =>
  Effect.gen(function* () {
    const suffix = yield* parseEpisodeStreamRange("bytes=-10", 100);

    assert.deepStrictEqual(suffix, { start: 90, end: 99 });
  }),
);

it.effect("rejects invalid episode stream ranges", () =>
  Effect.gen(function* () {
    const exit = yield* Effect.exit(parseEpisodeStreamRange("bytes=-0", 100));
    const inverted = yield* Effect.exit(parseEpisodeStreamRange("bytes=20-10", 100));
    const multi = yield* Effect.exit(parseEpisodeStreamRange("bytes=0-1,2-3", 100));
    const nonByte = yield* Effect.exit(parseEpisodeStreamRange("items=0-1", 100));

    assert.deepStrictEqual(Exit.isFailure(exit), true);
    assert.deepStrictEqual(Exit.isFailure(inverted), true);
    assert.deepStrictEqual(Exit.isFailure(multi), true);
    assert.deepStrictEqual(Exit.isFailure(nonByte), true);

    for (const failureExit of [exit, inverted, multi, nonByte]) {
      if (Exit.isFailure(failureExit)) {
        const failure = Cause.failureOption(failureExit.cause);
        assert.deepStrictEqual(failure._tag, "Some");
        if (failure._tag === "Some") {
          assert.deepStrictEqual(failure.value instanceof EpisodeStreamRangeError, true);
          assert.deepStrictEqual(failure.value.status, 416);
        }
      }
    }
  }),
);
