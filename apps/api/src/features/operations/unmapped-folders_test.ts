import { assertEquals, it } from "../../test/vitest.ts";
import { Effect } from "effect";

import type { AnimeSearchResult } from "../../../../../packages/shared/src/index.ts";

import {
  buildUnmappedFolderSearchQueries,
  hasUnmappedFolderRetryAttemptsRemaining,
  isUnmappedFolderOutstanding,
  markUnmappedFolderFailed,
  markUnmappedFolderMatching,
  markUnmappedFolderPaused,
  markUnmappedFolderPending,
  mergeUnmappedFolderSuggestions,
  resetUnmappedFolderMatch,
  suggestUnmappedFolders,
} from "./unmapped-folders.ts";

it("buildUnmappedFolderSearchQueries strips release noise and adds fallback titles", () => {
  assertEquals(
    buildUnmappedFolderSearchQueries("Scissor.Seven.S04.1080p.NF.WEB-DL.AAC2.0.H.264-VARYG"),
    ["Scissor Seven Season 4", "Scissor Seven"],
  );

  assertEquals(buildUnmappedFolderSearchQueries("Mono (2025)"), ["Mono"]);
});

it.effect(
  "suggestUnmappedFolders reuses normalized queries and falls back when first query misses",
  () =>
    Effect.gen(function* () {
      const calls: string[] = [];
      const suggestions = yield* suggestUnmappedFolders(
        [
          {
            name: "Scissor.Seven.S04.1080p.NF.WEB-DL.AAC2.0.H.264-VARYG",
            path: "/library/Scissor.Seven.S04.1080p.NF.WEB-DL.AAC2.0.H.264-VARYG",
          },
          {
            name: "Mono (2025)",
            path: "/library/Mono (2025)",
          },
        ],
        (query: string) => {
          calls.push(query);

          switch (query) {
            case "Scissor Seven Season 4":
              return Effect.succeed([]);
            case "Scissor Seven":
              return Effect.succeed([
                {
                  already_in_library: false,
                  id: 1,
                  title: { romaji: "Scissor Seven" },
                },
              ] satisfies AnimeSearchResult[]);
            case "Mono":
              return Effect.succeed([
                {
                  already_in_library: false,
                  id: 2,
                  title: { romaji: "Mono" },
                },
              ] satisfies AnimeSearchResult[]);
            default:
              return Effect.succeed([] satisfies AnimeSearchResult[]);
          }
        },
      );

      assertEquals(calls, ["Scissor Seven Season 4", "Scissor Seven", "Mono"]);
      assertEquals(suggestions[0].search_queries, ["Scissor Seven Season 4", "Scissor Seven"]);
      assertEquals(suggestions[0].suggested_matches[0]?.id, 1);
      assertEquals(suggestions[0].suggested_matches[0]?.match_confidence, 1);
      assertEquals(
        suggestions[0].suggested_matches[0]?.match_reason,
        'Matched AniList search after removing season or release noise from "Scissor.Seven.S04.1080p.NF.WEB-DL.AAC2.0.H.264-VARYG"',
      );
      assertEquals(suggestions[1].suggested_matches[0]?.id, 2);
    }),
);

it("unmapped folder helpers track matching status transitions", () => {
  const base = {
    match_status: "pending" as const,
    match_attempts: 0,
    name: "Naruto Archive",
    path: "/library/Naruto Archive",
    search_queries: ["Naruto Archive"],
    size: 0,
    suggested_matches: [] as AnimeSearchResult[],
  };

  const matching = markUnmappedFolderMatching(base);
  const done = mergeUnmappedFolderSuggestions(
    base,
    [
      {
        already_in_library: true,
        id: 20,
        match_confidence: 0.98,
        match_reason: 'Matched a library title from the normalized folder name "Naruto Archive"',
        title: { romaji: "Naruto" },
      },
    ],
    "2024-01-01T00:00:00.000Z",
  );
  const failed = markUnmappedFolderFailed(base, "rate limited", "2024-01-01T00:00:00.000Z");
  const pending = markUnmappedFolderPending(done);

  assertEquals(matching.match_status, "matching");
  assertEquals(done.match_status, "done");
  assertEquals(done.match_attempts, 0);
  assertEquals(done.suggested_matches[0]?.id, 20);
  assertEquals(done.suggested_matches[0]?.match_confidence, 0.98);
  assertEquals(typeof done.last_matched_at, "string");
  assertEquals(failed.match_status, "failed");
  assertEquals(failed.match_attempts, 1);
  assertEquals(failed.last_match_error, "rate limited");
  assertEquals(pending.match_status, "pending");
  assertEquals(pending.match_attempts, 0);
  assertEquals(pending.last_match_error, undefined);
});

it("unmapped folder helpers support pause and reset controls", () => {
  const base = {
    last_match_error: "rate limited",
    last_matched_at: "2024-01-01T00:00:00.000Z",
    match_attempts: 2,
    match_status: "failed" as const,
    name: "Naruto Archive",
    path: "/library/Naruto Archive",
    search_queries: ["Naruto Archive"],
    size: 0,
    suggested_matches: [
      {
        already_in_library: true,
        id: 20,
        title: { romaji: "Naruto" },
      },
    ] satisfies AnimeSearchResult[],
  };

  const paused = markUnmappedFolderPaused(base);
  const reset = resetUnmappedFolderMatch(base);

  assertEquals(paused.match_status, "paused");
  assertEquals(paused.match_attempts, 2);
  assertEquals(paused.last_match_error, "rate limited");

  assertEquals(reset.match_status, "pending");
  assertEquals(reset.match_attempts, 0);
  assertEquals(reset.last_match_error, undefined);
  assertEquals(reset.last_matched_at, undefined);
  assertEquals(reset.suggested_matches, []);
});

it("unmapped folder retry helpers stop after three failed attempts", () => {
  const retryable = {
    match_attempts: 2,
    match_status: "failed" as const,
  };
  const exhausted = {
    match_attempts: 3,
    match_status: "failed" as const,
  };

  assertEquals(hasUnmappedFolderRetryAttemptsRemaining(retryable), true);
  assertEquals(isUnmappedFolderOutstanding(retryable), true);
  assertEquals(hasUnmappedFolderRetryAttemptsRemaining(exhausted), false);
  assertEquals(isUnmappedFolderOutstanding(exhausted), false);
});
