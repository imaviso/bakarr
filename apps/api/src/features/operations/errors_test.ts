import { assert, it } from "@effect/vitest";

import {
  DownloadNotFoundError,
  OperationsAnimeNotFoundError,
  OperationsTaskNotFoundError,
  DownloadConflictError,
  OperationsInputError,
  OperationsConflictError,
  OperationsPathError,
  RssFeedRejectedError,
  RssFeedParseError,
  RssFeedTooLargeError,
  OperationsStoredDataError,
  OperationsInfrastructureError,
  isOperationsError,
} from "@/features/operations/errors.ts";

it("DownloadNotFoundError constructs", () => {
  const error = new DownloadNotFoundError({ message: "not found" });
  assert.deepStrictEqual(error._tag, "DomainNotFoundError");
});

it("OperationsAnimeNotFoundError constructs", () => {
  const error = new OperationsAnimeNotFoundError({ message: "media missing" });
  assert.deepStrictEqual(error._tag, "DomainNotFoundError");
});

it("OperationsTaskNotFoundError constructs", () => {
  const error = new OperationsTaskNotFoundError({ message: "task gone" });
  assert.deepStrictEqual(error._tag, "DomainNotFoundError");
});

it("DownloadConflictError constructs", () => {
  const error = new DownloadConflictError({ message: "duplicate" });
  assert.deepStrictEqual(error._tag, "DomainConflictError");
});

it("OperationsInputError constructs with optional cause", () => {
  const error = new OperationsInputError({ message: "bad input" });
  assert.deepStrictEqual(error._tag, "DomainInputError");
});

it("OperationsConflictError constructs", () => {
  const error = new OperationsConflictError({ message: "conflict" });
  assert.deepStrictEqual(error._tag, "DomainConflictError");
});

it("OperationsPathError constructs", () => {
  const error = new OperationsPathError({ message: "bad path" });
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

it("OperationsStoredDataError constructs", () => {
  const error = new OperationsStoredDataError({ message: "corrupt" });
  assert.deepStrictEqual(error._tag, "StoredDataError");
});

it("OperationsInfrastructureError constructs", () => {
  const error = new OperationsInfrastructureError({ cause: new Error("db"), message: "infra" });
  assert.deepStrictEqual(error._tag, "InfrastructureError");
});

it("isOperationsError returns true for all operation error types", () => {
  assert.ok(isOperationsError(new DownloadNotFoundError({ message: "x" })));
  assert.ok(isOperationsError(new OperationsInputError({ message: "x" })));
  assert.ok(isOperationsError(new RssFeedParseError({ message: "x" })));
  assert.ok(isOperationsError(new RssFeedTooLargeError({ message: "x" })));
});

it("isOperationsError returns false for plain Error", () => {
  assert.deepStrictEqual(isOperationsError(new Error("nope")), false);
});
