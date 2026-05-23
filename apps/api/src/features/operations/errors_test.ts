import { assert, it } from "@effect/vitest";

import {
  DomainConflictError,
  DomainInputError,
  DomainNotFoundError,
  DomainPathError,
  InfrastructureError,
  StoredDataError,
} from "@/features/errors.ts";
import {
  RssFeedRejectedError,
  RssFeedParseError,
  RssFeedTooLargeError,
  isOperationsError,
} from "@/features/operations/errors.ts";

it("DomainNotFoundError constructs", () => {
  const error = new DomainNotFoundError({ message: "not found" });
  assert.deepStrictEqual(error._tag, "DomainNotFoundError");
});

it("DomainNotFoundError constructs", () => {
  const error = new DomainNotFoundError({ message: "media missing" });
  assert.deepStrictEqual(error._tag, "DomainNotFoundError");
});

it("DomainNotFoundError constructs", () => {
  const error = new DomainNotFoundError({ message: "task gone" });
  assert.deepStrictEqual(error._tag, "DomainNotFoundError");
});

it("DomainConflictError constructs", () => {
  const error = new DomainConflictError({ message: "duplicate" });
  assert.deepStrictEqual(error._tag, "DomainConflictError");
});

it("DomainInputError constructs with optional cause", () => {
  const error = new DomainInputError({ message: "bad input" });
  assert.deepStrictEqual(error._tag, "DomainInputError");
});

it("DomainConflictError constructs", () => {
  const error = new DomainConflictError({ message: "conflict" });
  assert.deepStrictEqual(error._tag, "DomainConflictError");
});

it("DomainPathError constructs", () => {
  const error = new DomainPathError({ message: "bad path" });
  assert.deepStrictEqual(error._tag, "DomainPathError");
});

it("RssFeedRejectedError constructs", () => {
  const error = new RssFeedRejectedError({ message: "rejected" });
  assert.deepStrictEqual(error._tag, "RssFeedRejectedError");
});

it("RssFeedParseError constructs", () => {
  const error = new RssFeedParseError({ message: "parse error" });
  assert.deepStrictEqual(error._tag, "RssFeedParseError");
});

it("RssFeedTooLargeError constructs", () => {
  const error = new RssFeedTooLargeError({ message: "too large" });
  assert.deepStrictEqual(error._tag, "RssFeedTooLargeError");
});

it("StoredDataError constructs", () => {
  const error = new StoredDataError({ message: "corrupt" });
  assert.deepStrictEqual(error._tag, "StoredDataError");
});

it("InfrastructureError constructs", () => {
  const error = new InfrastructureError({ cause: new Error("db"), message: "infra" });
  assert.deepStrictEqual(error._tag, "InfrastructureError");
});

it("isOperationsError returns true for all operation error types", () => {
  assert.ok(isOperationsError(new DomainNotFoundError({ message: "x" })));
  assert.ok(isOperationsError(new DomainInputError({ message: "x" })));
  assert.ok(isOperationsError(new RssFeedParseError({ message: "x" })));
  assert.ok(isOperationsError(new RssFeedTooLargeError({ message: "x" })));
});

it("isOperationsError returns false for plain Error", () => {
  assert.deepStrictEqual(isOperationsError(new Error("nope")), false);
});
