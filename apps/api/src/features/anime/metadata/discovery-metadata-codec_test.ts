import { Effect } from "effect";
import { assert, it } from "@effect/vitest";
import { brandAnimeId } from "@packages/shared/index.ts";

import {
  encodeAnimeDiscoveryEntries,
  encodeAnimeSynonyms,
} from "@/features/anime/metadata/discovery-metadata-codec.ts";

it("encodeAnimeDiscoveryEntries returns null for undefined", () =>
  Effect.gen(function* () {
    const result = yield* encodeAnimeDiscoveryEntries(undefined);
    assert.deepStrictEqual(result, null);
  }));

it("encodeAnimeDiscoveryEntries returns null for empty array", () =>
  Effect.gen(function* () {
    const result = yield* encodeAnimeDiscoveryEntries([]);
    assert.deepStrictEqual(result, null);
  }));

it("encodeAnimeDiscoveryEntries encodes valid entries to JSON string", () =>
  Effect.gen(function* () {
    const result = yield* encodeAnimeDiscoveryEntries([
      { id: brandAnimeId(1), title: { romaji: "Test", english: undefined, native: undefined } },
    ]);
    assert.ok(typeof result === "string");
    assert.ok(result.includes('"romaji":"Test"'));
  }));

it("encodeAnimeSynonyms returns null for undefined", () =>
  Effect.gen(function* () {
    const result = yield* encodeAnimeSynonyms(undefined);
    assert.deepStrictEqual(result, null);
  }));

it("encodeAnimeSynonyms returns null for empty array", () =>
  Effect.gen(function* () {
    const result = yield* encodeAnimeSynonyms([]);
    assert.deepStrictEqual(result, null);
  }));

it("encodeAnimeSynonyms encodes string array to JSON", () =>
  Effect.gen(function* () {
    const result = yield* encodeAnimeSynonyms(["syn1", "syn2"]);
    assert.ok(typeof result === "string");
    assert.ok(result.includes("syn1"));
    assert.ok(result.includes("syn2"));
  }));
