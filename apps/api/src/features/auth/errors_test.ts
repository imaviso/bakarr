import { assert, it } from "@effect/vitest";

import { AuthError } from "@/features/auth/errors.ts";

it("AuthError constructs with message and kind", () => {
  const error = new AuthError({ kind: "Unauthorized", message: "invalid credentials" });
  assert.deepStrictEqual(error.message, "invalid credentials");
  assert.deepStrictEqual(error.kind, "Unauthorized");
});

it("AuthError supports all valid route-mapped kinds", () => {
  for (const kind of ["BadRequest", "Unauthorized", "Forbidden", "NotFound"] as const) {
    const error = new AuthError({ kind, message: "test" });
    assert.deepStrictEqual(error.kind, kind);
  }
});
