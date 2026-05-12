import { assert, it } from "@effect/vitest";

import {
  ConfigValidationError,
  StoredConfigCorruptError,
  StoredConfigMissingError,
  ProfileNotFoundError,
  ImageAssetNotFoundError,
  ImageAssetTooLargeError,
  ImageAssetAccessError,
  StoredUnmappedFolderCorruptError,
  isStoredConfigReadError,
} from "@/features/system/errors.ts";

it("ConfigValidationError constructs", () => {
  const error = new ConfigValidationError({ message: "bad config" });
  assert.deepStrictEqual(error._tag, "ConfigValidationError");
  assert.deepStrictEqual(error.message, "bad config");
});

it("StoredConfigCorruptError constructs", () => {
  const error = new StoredConfigCorruptError({ cause: new Error("parse"), message: "corrupt" });
  assert.deepStrictEqual(error._tag, "StoredConfigCorruptError");
});

it("StoredConfigMissingError constructs", () => {
  const error = new StoredConfigMissingError({ message: "missing" });
  assert.deepStrictEqual(error._tag, "StoredConfigMissingError");
});

it("ProfileNotFoundError constructs", () => {
  const error = new ProfileNotFoundError({ message: "not found" });
  assert.deepStrictEqual(error._tag, "DomainNotFoundError");
});

it("ImageAssetNotFoundError has status 404", () => {
  const error = new ImageAssetNotFoundError({ message: "not found", status: 404 as const });
  assert.deepStrictEqual(error.status, 404);
});

it("ImageAssetTooLargeError has status 413", () => {
  const error = new ImageAssetTooLargeError({ message: "too large", status: 413 as const });
  assert.deepStrictEqual(error.status, 413);
});

it("ImageAssetAccessError has status 500", () => {
  const error = new ImageAssetAccessError({ message: "access error", status: 500 as const });
  assert.deepStrictEqual(error.status, 500);
});

it("StoredUnmappedFolderCorruptError constructs", () => {
  const error = new StoredUnmappedFolderCorruptError({ message: "bad unmapped" });
  assert.deepStrictEqual(error._tag, "StoredUnmappedFolderCorruptError");
});

it("isStoredConfigReadError matches StoredConfigCorruptError", () => {
  assert.ok(
    isStoredConfigReadError(
      new StoredConfigCorruptError({ cause: new Error("x"), message: "bad" }),
    ),
  );
});

it("isStoredConfigReadError matches StoredConfigMissingError", () => {
  assert.ok(isStoredConfigReadError(new StoredConfigMissingError({ message: "gone" })));
});

it("isStoredConfigReadError rejects other errors", () => {
  assert.deepStrictEqual(isStoredConfigReadError(new Error("random")), false);
  assert.deepStrictEqual(
    isStoredConfigReadError(new ProfileNotFoundError({ message: "nope" })),
    false,
  );
});
