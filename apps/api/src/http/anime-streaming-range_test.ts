import assert from "node:assert/strict";
import { Effect, Exit } from "effect";

import { it } from "@effect/vitest";
import { parseEpisodeStreamRange } from "@/http/anime-streaming-range.ts";

it("parses absolute and open-ended episode stream ranges", () => {
  const absolute = Effect.runSync(parseEpisodeStreamRange("bytes=10-19", 100));
  const openEnded = Effect.runSync(parseEpisodeStreamRange("bytes=10-", 100));

  assert.deepStrictEqual(absolute, { start: 10, end: 19 });
  assert.deepStrictEqual(openEnded, { start: 10, end: 99 });
});

it("parses suffix episode stream ranges", () => {
  const suffix = Effect.runSync(parseEpisodeStreamRange("bytes=-10", 100));

  assert.deepStrictEqual(suffix, { start: 90, end: 99 });
});

it("rejects invalid episode stream ranges", () => {
  const exit = Effect.runSyncExit(parseEpisodeStreamRange("bytes=-0", 100));
  const multi = Effect.runSyncExit(parseEpisodeStreamRange("bytes=0-1,2-3", 100));
  const nonByte = Effect.runSyncExit(parseEpisodeStreamRange("items=0-1", 100));

  assert.deepStrictEqual(Exit.isFailure(exit), true);
  assert.deepStrictEqual(Exit.isFailure(multi), true);
  assert.deepStrictEqual(Exit.isFailure(nonByte), true);
});
