import { assert, it } from "@effect/vitest";

import {
  AuthBadRequestError,
  AuthForbiddenError,
  AuthNotFoundError,
  AuthUnauthorizedError,
} from "@/features/auth/errors.ts";

it("auth errors construct with message and tag", () => {
  const error = new AuthUnauthorizedError({ message: "invalid credentials" });
  assert.deepStrictEqual(error.message, "invalid credentials");
  assert.deepStrictEqual(error._tag, "AuthUnauthorizedError");
});

it("auth errors expose separate tags for route mapping", () => {
  for (const [ErrorClass, tag] of [
    [AuthBadRequestError, "AuthBadRequestError"],
    [AuthUnauthorizedError, "AuthUnauthorizedError"],
    [AuthForbiddenError, "AuthForbiddenError"],
    [AuthNotFoundError, "AuthNotFoundError"],
  ] as const) {
    const error = new ErrorClass({ message: "test" });
    assert.deepStrictEqual(error._tag, tag);
  }
});
