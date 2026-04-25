import { assert, describe, it } from "@effect/vitest";

import { isNotFoundError } from "@/infra/filesystem/fs-errors.ts";

describe("isNotFoundError", () => {
  it("detects ENOENT causes wrapped directly", () => {
    const cause = Object.assign(new Error("missing"), { code: "ENOENT" });

    assert.deepStrictEqual(isNotFoundError({ cause }), true);
  });

  it("detects Effect SystemError not-found causes", () => {
    const cause = {
      _tag: "SystemError",
      reason: "NotFound",
    };

    assert.deepStrictEqual(isNotFoundError({ cause }), true);
  });
});
