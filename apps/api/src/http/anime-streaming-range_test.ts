import { Effect, Exit } from "effect";

import { assertEquals, it } from "../test/vitest.ts";
import { parseEpisodeStreamRange } from "./anime-streaming-range.ts";

it("parses absolute and open-ended episode stream ranges", () => {
  const absolute = Effect.runSync(parseEpisodeStreamRange("bytes=10-19", 100));
  const openEnded = Effect.runSync(parseEpisodeStreamRange("bytes=10-", 100));

  assertEquals(absolute, { start: 10, end: 19 });
  assertEquals(openEnded, { start: 10, end: 99 });
});

it("parses suffix episode stream ranges", () => {
  const suffix = Effect.runSync(parseEpisodeStreamRange("bytes=-10", 100));

  assertEquals(suffix, { start: 90, end: 99 });
});

it("rejects invalid episode stream ranges", () => {
  const exit = Effect.runSyncExit(parseEpisodeStreamRange("bytes=-0", 100));

  assertEquals(Exit.isFailure(exit), true);
});
