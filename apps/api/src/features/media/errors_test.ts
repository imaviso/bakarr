import { assert, it } from "@effect/vitest";

import {
  DomainConflictError,
  DomainNotFoundError,
  DomainPathError,
  StoredDataError,
} from "@/features/errors.ts";
import { AniDbRuntimeConfigError } from "@/features/media/errors.ts";

it("DomainNotFoundError constructs with message", () => {
  const error = new DomainNotFoundError({ message: "not found" });
  assert.deepStrictEqual(error.message, "not found");
  assert.deepStrictEqual(error._tag, "DomainNotFoundError");
});

it("DomainConflictError constructs with message", () => {
  const error = new DomainConflictError({ message: "conflict" });
  assert.deepStrictEqual(error.message, "conflict");
  assert.deepStrictEqual(error._tag, "DomainConflictError");
});

it("DomainPathError constructs with message and optional cause", () => {
  const cause = new Error("fs error");
  const error = new DomainPathError({ cause, message: "path error" });
  assert.deepStrictEqual(error.message, "path error");
  assert.deepStrictEqual(error._tag, "DomainPathError");
});

it("DomainPathError constructs without cause", () => {
  const error = new DomainPathError({ message: "boom" });
  assert.deepStrictEqual(error.message, "boom");
});

it("StoredDataError constructs with cause and message", () => {
  const cause = new Error("parse");
  const error = new StoredDataError({ cause, message: "corrupt" });
  assert.deepStrictEqual(error.message, "corrupt");
  assert.deepStrictEqual(error._tag, "StoredDataError");
});

it("AniDbRuntimeConfigError constructs with cause and message", () => {
  const cause = new Error("config");
  const error = new AniDbRuntimeConfigError({ cause, message: "bad config" });
  assert.deepStrictEqual(error.message, "bad config");
  assert.deepStrictEqual(error._tag, "AniDbRuntimeConfigError");
});
