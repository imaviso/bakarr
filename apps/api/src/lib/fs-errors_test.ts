import assert from "node:assert/strict";
import { describe, it } from "@effect/vitest";

import { isNotFoundError } from "@/lib/fs-errors.ts";

describe("isNotFoundError", () => {
  it("detects ENOENT causes wrapped directly", () => {
    const cause = new Error("missing") as Error & { code?: string };
    cause.code = "ENOENT";

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
