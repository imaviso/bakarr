import { assert, it } from "@effect/vitest";

import {
  AuthBadRequestError,
  AuthForbiddenError,
  AuthNotFoundError,
  AuthUnauthorizedError,
  type AuthError,
} from "@/features/auth/errors.ts";

it("auth errors construct with message and tag", () => {
  const error = new AuthUnauthorizedError({ message: "invalid credentials" });
  assert.deepStrictEqual(error.message, "invalid credentials");
  assert.deepStrictEqual(error._tag, "AuthUnauthorizedError");
});

it("auth errors expose separate tags for route mapping", () => {
  const errorTagPairs: ReadonlyArray<
    [new (input: { readonly message: string }) => AuthError, string]
  > = [
    [AuthBadRequestError, "AuthBadRequestError"],
    [AuthUnauthorizedError, "AuthUnauthorizedError"],
    [AuthForbiddenError, "AuthForbiddenError"],
    [AuthNotFoundError, "AuthNotFoundError"],
  ];

  for (const [ErrorClass, tag] of errorTagPairs) {
    const error = new ErrorClass({ message: "test" });
    assert.deepStrictEqual(error._tag, tag);
  }
});
