import { assertEquals } from "@std/assert";
import { Effect } from "effect";

import type { AnimeSearchResult } from "../../../../../packages/shared/src/index.ts";

import {
  buildUnmappedFolderSearchQueries,
  markUnmappedFolderFailed,
  markUnmappedFolderMatching,
  markUnmappedFolderPending,
  mergeUnmappedFolderSuggestions,
  suggestUnmappedFolders,
} from "./unmapped-folders.ts";

Deno.test("buildUnmappedFolderSearchQueries strips release noise and adds fallback titles", () => {
  assertEquals(
    buildUnmappedFolderSearchQueries(
      "Scissor.Seven.S04.1080p.NF.WEB-DL.AAC2.0.H.264-VARYG",
    ),
    ["Scissor Seven Season 4", "Scissor Seven"],
  );

  assertEquals(buildUnmappedFolderSearchQueries("Mono (2025)"), ["Mono"]);
});

Deno.test("suggestUnmappedFolders reuses normalized queries and falls back when first query misses", async () => {
  const calls: string[] = [];
  const suggestions = await Effect.runPromise(
    suggestUnmappedFolders(
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
            return Effect.succeed(
              [
                {
                  already_in_library: false,
                  id: 1,
                  title: { romaji: "Scissor Seven" },
                },
              ] satisfies AnimeSearchResult[],
            );
          case "Mono":
            return Effect.succeed(
              [
                {
                  already_in_library: false,
                  id: 2,
                  title: { romaji: "Mono" },
                },
              ] satisfies AnimeSearchResult[],
            );
          default:
            return Effect.succeed([] satisfies AnimeSearchResult[]);
        }
      },
    ),
  );

  assertEquals(calls, ["Scissor Seven Season 4", "Scissor Seven", "Mono"]);
  assertEquals(suggestions[0].suggested_matches[0]?.id, 1);
  assertEquals(suggestions[1].suggested_matches[0]?.id, 2);
});

Deno.test("unmapped folder helpers track matching status transitions", () => {
  const base = {
    match_status: "pending" as const,
    name: "Naruto Archive",
    path: "/library/Naruto Archive",
    size: 0,
    suggested_matches: [] as AnimeSearchResult[],
  };

  const matching = markUnmappedFolderMatching(base);
  const done = mergeUnmappedFolderSuggestions(base, [{
    already_in_library: true,
    id: 20,
    title: { romaji: "Naruto" },
  }]);
  const failed = markUnmappedFolderFailed(base, "rate limited");
  const pending = markUnmappedFolderPending(done);

  assertEquals(matching.match_status, "matching");
  assertEquals(done.match_status, "done");
  assertEquals(done.suggested_matches[0]?.id, 20);
  assertEquals(typeof done.last_matched_at, "string");
  assertEquals(failed.match_status, "failed");
  assertEquals(failed.last_match_error, "rate limited");
  assertEquals(pending.match_status, "pending");
  assertEquals(pending.last_match_error, undefined);
});
