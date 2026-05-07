import { assert, it } from "@effect/vitest";

import { AuthError } from "@/features/auth/errors.ts";

it("AuthError constructs with message and status", () => {
  const error = new AuthError({ message: "invalid credentials", status: 401 });
  assert.deepStrictEqual(error.message, "invalid credentials");
  assert.deepStrictEqual(error.status, 401);
});

it("AuthError supports all valid status codes", () => {
  for (const status of [400, 401, 403, 404, 409] as const) {
    const error = new AuthError({ message: "test", status });
    assert.deepStrictEqual(error.status, status);
  }
});
