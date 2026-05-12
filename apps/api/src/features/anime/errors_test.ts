import { assert, it } from "@effect/vitest";

import {
  AnimeNotFoundError,
  AnimeConflictError,
  AnimePathError,
  AnimeStoredDataError,
  AniDbRuntimeConfigError,
} from "@/features/anime/errors.ts";

it("AnimeNotFoundError constructs with message", () => {
  const error = new AnimeNotFoundError({ message: "not found" });
  assert.deepStrictEqual(error.message, "not found");
  assert.deepStrictEqual(error._tag, "DomainNotFoundError");
});

it("AnimeConflictError constructs with message", () => {
  const error = new AnimeConflictError({ message: "conflict" });
  assert.deepStrictEqual(error.message, "conflict");
  assert.deepStrictEqual(error._tag, "DomainConflictError");
});

it("AnimePathError constructs with message and optional cause", () => {
  const cause = new Error("fs error");
  const error = new AnimePathError({ cause, message: "path error" });
  assert.deepStrictEqual(error.message, "path error");
  assert.deepStrictEqual(error._tag, "DomainPathError");
});

it("AnimePathError constructs without cause", () => {
  const error = new AnimePathError({ message: "boom" });
  assert.deepStrictEqual(error.message, "boom");
});

it("AnimeStoredDataError constructs with cause and message", () => {
  const cause = new Error("parse");
  const error = new AnimeStoredDataError({ cause, message: "corrupt" });
  assert.deepStrictEqual(error.message, "corrupt");
  assert.deepStrictEqual(error._tag, "StoredDataError");
});

it("AniDbRuntimeConfigError constructs with cause and message", () => {
  const cause = new Error("config");
  const error = new AniDbRuntimeConfigError({ cause, message: "bad config" });
  assert.deepStrictEqual(error.message, "bad config");
  assert.deepStrictEqual(error._tag, "AniDbRuntimeConfigError");
});
