import { assert, it } from "@effect/vitest";
import { brandMediaId, type MediaSearchResult } from "@packages/shared/index.ts";

import { annotateMediaSearchResultsForQuery } from "@/features/media/query/media-search-annotation.ts";

function makeResult(overrides: Partial<MediaSearchResult> = {}): MediaSearchResult {
  return {
    id: brandMediaId(1),
    already_in_library: false,
    synonyms: [],
    title: {
      english: "Naruto",
      native: "ナルト",
      romaji: "Naruto",
    },
    ...overrides,
  };
}

it("annotateMediaSearchResultsForQuery returns unmodified results for empty query", () => {
  const results = [makeResult({ id: brandMediaId(1) }), makeResult({ id: brandMediaId(2) })];
  const annotated = annotateMediaSearchResultsForQuery("", results);
  assert.deepStrictEqual(annotated, results);
});

it("annotateMediaSearchResultsForQuery adds match confidence for results", () => {
  const results = [
    makeResult({
      id: brandMediaId(1),
      title: { english: "One Piece", native: undefined, romaji: "One Piece" },
    }),
  ];
  const annotated = annotateMediaSearchResultsForQuery("one piece", results);
  assert.deepStrictEqual(annotated[0]!.match_confidence, 1);
  assert.deepStrictEqual(annotated[0]!.match_reason, 'Exact title match for "one piece"');
});

it("annotateMediaSearchResultsForQuery distinguishes strong and partial matches", () => {
  const annotated = annotateMediaSearchResultsForQuery("one piece", [
    makeResult({
      id: brandMediaId(1),
      title: { english: undefined, native: undefined, romaji: "One Piece Film Red" },
    }),
    makeResult({
      id: brandMediaId(2),
      title: { english: undefined, native: undefined, romaji: "One Punch Man" },
    }),
  ]);

  assert.deepStrictEqual(annotated[0]!.match_confidence, 0.8);
  assert.deepStrictEqual(annotated[0]!.match_reason, 'Strong title match for "one piece"');
  assert.deepStrictEqual(annotated[1]!.match_confidence, 0.25);
  assert.deepStrictEqual(annotated[1]!.match_reason, 'Partial title match for "one piece"');
});

it("annotateMediaSearchResultsForQuery handles whitespace-only query as empty", () => {
  const results = [makeResult()];
  const annotated = annotateMediaSearchResultsForQuery("   ", results);
  assert.deepStrictEqual(annotated, results);
});
