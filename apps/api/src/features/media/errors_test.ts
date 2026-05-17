import { assert, it } from "@effect/vitest";

import {
  MediaNotFoundError,
  MediaConflictError,
  MediaPathError,
  MediaStoredDataError,
  AniDbRuntimeConfigError,
} from "@/features/media/errors.ts";

it("MediaNotFoundError constructs with message", () => {
  const error = new MediaNotFoundError({ message: "not found" });
  assert.deepStrictEqual(error.message, "not found");
  assert.deepStrictEqual(error._tag, "DomainNotFoundError");
});

it("MediaConflictError constructs with message", () => {
  const error = new MediaConflictError({ message: "conflict" });
  assert.deepStrictEqual(error.message, "conflict");
  assert.deepStrictEqual(error._tag, "DomainConflictError");
});

it("MediaPathError constructs with message and optional cause", () => {
  const cause = new Error("fs error");
  const error = new MediaPathError({ cause, message: "path error" });
  assert.deepStrictEqual(error.message, "path error");
  assert.deepStrictEqual(error._tag, "DomainPathError");
});

it("MediaPathError constructs without cause", () => {
  const error = new MediaPathError({ message: "boom" });
  assert.deepStrictEqual(error.message, "boom");
});

it("MediaStoredDataError constructs with cause and message", () => {
  const cause = new Error("parse");
  const error = new MediaStoredDataError({ cause, message: "corrupt" });
  assert.deepStrictEqual(error.message, "corrupt");
  assert.deepStrictEqual(error._tag, "StoredDataError");
});

it("AniDbRuntimeConfigError constructs with cause and message", () => {
  const cause = new Error("config");
  const error = new AniDbRuntimeConfigError({ cause, message: "bad config" });
  assert.deepStrictEqual(error.message, "bad config");
  assert.deepStrictEqual(error._tag, "AniDbRuntimeConfigError");
});
