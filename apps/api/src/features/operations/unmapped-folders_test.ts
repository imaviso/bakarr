import { assert, it } from "@effect/vitest";
import { Effect } from "effect";

import type { AnimeSearchResult } from "@packages/shared/index.ts";

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
} from "@/features/operations/unmapped-folders.ts";

it("buildUnmappedFolderSearchQueries strips release noise and adds fallback titles", () => {
  assert.deepStrictEqual(
    buildUnmappedFolderSearchQueries("Scissor.Seven.S04.1080p.NF.WEB-DL.AAC2.0.H.264-VARYG"),
    ["Scissor Seven Season 4", "Scissor Seven"],
  );

  assert.deepStrictEqual(buildUnmappedFolderSearchQueries("Mono (2025)"), ["Mono"]);
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

      assert.deepStrictEqual(calls, ["Scissor Seven Season 4", "Scissor Seven", "Mono"]);
      const [firstSuggestion, secondSuggestion] = suggestions;
      assert.deepStrictEqual(firstSuggestion !== undefined, true);
      assert.deepStrictEqual(secondSuggestion !== undefined, true);
      if (!firstSuggestion || !secondSuggestion) {
        return;
      }
      assert.deepStrictEqual(firstSuggestion.search_queries, [
        "Scissor Seven Season 4",
        "Scissor Seven",
      ]);
      assert.deepStrictEqual(firstSuggestion.suggested_matches[0]?.id, 1);
      assert.deepStrictEqual(firstSuggestion.suggested_matches[0]?.match_confidence, 1);
      assert.deepStrictEqual(
        firstSuggestion.suggested_matches[0]?.match_reason,
        'Matched AniList search after removing season or release noise from "Scissor.Seven.S04.1080p.NF.WEB-DL.AAC2.0.H.264-VARYG"',
      );
      assert.deepStrictEqual(secondSuggestion.suggested_matches[0]?.id, 2);
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

  assert.deepStrictEqual(matching.match_status, "matching");
  assert.deepStrictEqual(done.match_status, "done");
  assert.deepStrictEqual(done.match_attempts, 0);
  assert.deepStrictEqual(done.suggested_matches[0]?.id, 20);
  assert.deepStrictEqual(done.suggested_matches[0]?.match_confidence, 0.98);
  assert.deepStrictEqual(typeof done.last_matched_at, "string");
  assert.deepStrictEqual(failed.match_status, "failed");
  assert.deepStrictEqual(failed.match_attempts, 1);
  assert.deepStrictEqual(failed.last_match_error, "rate limited");
  assert.deepStrictEqual(pending.match_status, "pending");
  assert.deepStrictEqual(pending.match_attempts, 0);
  assert.deepStrictEqual(pending.last_match_error, undefined);
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

  assert.deepStrictEqual(paused.match_status, "paused");
  assert.deepStrictEqual(paused.match_attempts, 2);
  assert.deepStrictEqual(paused.last_match_error, "rate limited");

  assert.deepStrictEqual(reset.match_status, "pending");
  assert.deepStrictEqual(reset.match_attempts, 0);
  assert.deepStrictEqual(reset.last_match_error, undefined);
  assert.deepStrictEqual(reset.last_matched_at, undefined);
  assert.deepStrictEqual(reset.suggested_matches, []);
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

  assert.deepStrictEqual(hasUnmappedFolderRetryAttemptsRemaining(retryable), true);
  assert.deepStrictEqual(isUnmappedFolderOutstanding(retryable), true);
  assert.deepStrictEqual(hasUnmappedFolderRetryAttemptsRemaining(exhausted), false);
  assert.deepStrictEqual(isUnmappedFolderOutstanding(exhausted), false);
});
