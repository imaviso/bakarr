import { assertEquals, describe, it } from "@/test/vitest.ts";

import { isNotFoundError } from "@/lib/fs-errors.ts";

describe("isNotFoundError", () => {
  it("detects ENOENT causes wrapped directly", () => {
    const cause = new Error("missing") as Error & { code?: string };
    cause.code = "ENOENT";

    assertEquals(isNotFoundError({ cause }), true);
  });

  it("detects Effect SystemError not-found causes", () => {
    const cause = {
      _tag: "SystemError",
      reason: "NotFound",
    };

    assertEquals(isNotFoundError({ cause }), true);
  });
});
