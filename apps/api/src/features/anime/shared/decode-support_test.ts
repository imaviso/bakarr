import { Cause, Effect, Exit, Option } from "effect";
import { assert, it } from "@effect/vitest";

import {
  decodeStoredStringListEffect,
  decodeStoredNumberListEffect,
  decodeStoredSynonymsEffect,
} from "@/features/anime/shared/decode-support.ts";
import { AnimeStoredDataError } from "@/features/anime/errors.ts";

function assertStoredDataError(exit: Exit.Exit<unknown, unknown>, message: string) {
  assert.deepStrictEqual(Exit.isFailure(exit), true);
  if (Exit.isFailure(exit)) {
    const failure = Cause.failureOption(exit.cause);
    assert.ok(Option.isSome(failure));
    assert.ok(failure.value instanceof AnimeStoredDataError);
    assert.deepStrictEqual(failure.value.message, message);
  }
}

it("decodeStoredStringListEffect returns empty array for null input", () =>
  Effect.gen(function* () {
    const result = yield* decodeStoredStringListEffect(null, "tags");
    assert.deepStrictEqual(result, []);
  }));

it("decodeStoredStringListEffect returns empty array for empty string", () =>
  Effect.gen(function* () {
    const result = yield* decodeStoredStringListEffect("", "tags");
    assert.deepStrictEqual(result, []);
  }));

it("decodeStoredStringListEffect decodes valid JSON array", () =>
  Effect.gen(function* () {
    const result = yield* decodeStoredStringListEffect('["a","b"]', "tags");
    assert.deepStrictEqual(result, ["a", "b"]);
  }));

it("decodeStoredStringListEffect fails on corrupt JSON", () =>
  Effect.gen(function* () {
    const exit = yield* Effect.exit(decodeStoredStringListEffect("not json", "tags"));
    assertStoredDataError(exit, "Stored anime tags JSON is corrupt");
  }));

it("decodeStoredStringListEffect fails on non-array JSON", () =>
  Effect.gen(function* () {
    const exit = yield* Effect.exit(decodeStoredStringListEffect('"just a string"', "tags"));
    assertStoredDataError(exit, "Stored anime tags JSON is corrupt");
  }));

it("decodeStoredNumberListEffect returns empty array for null", () =>
  Effect.gen(function* () {
    const result = yield* decodeStoredNumberListEffect(null, "episodes");
    assert.deepStrictEqual(result, []);
  }));

it("decodeStoredNumberListEffect decodes valid number array", () =>
  Effect.gen(function* () {
    const result = yield* decodeStoredNumberListEffect("[1,2,3]", "episodes");
    assert.deepStrictEqual(result, [1, 2, 3]);
  }));

it("decodeStoredNumberListEffect fails on non-number array", () =>
  Effect.gen(function* () {
    const exit = yield* Effect.exit(decodeStoredNumberListEffect('["a"]', "episodes"));
    assertStoredDataError(exit, "Stored anime episodes JSON is corrupt");
  }));

it("decodeStoredSynonymsEffect returns undefined for null", () =>
  Effect.gen(function* () {
    const result = yield* decodeStoredSynonymsEffect(null);
    assert.deepStrictEqual(result, undefined);
  }));

it("decodeStoredSynonymsEffect decodes valid synonyms", () =>
  Effect.gen(function* () {
    const result = yield* decodeStoredSynonymsEffect('["alt","names"]');
    assert.deepStrictEqual(result, ["alt", "names"]);
  }));

it("decodeStoredSynonymsEffect filters empty strings and returns undefined if all empty", () =>
  Effect.gen(function* () {
    const result = yield* decodeStoredSynonymsEffect('[""]');
    assert.deepStrictEqual(result, undefined);
  }));

it("decodeStoredSynonymsEffect fails on invalid JSON", () =>
  Effect.gen(function* () {
    const exit = yield* Effect.exit(decodeStoredSynonymsEffect("{bad}"));
    assertStoredDataError(exit, "Stored anime synonyms JSON is corrupt");
  }));
