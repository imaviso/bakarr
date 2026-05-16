import { Cause, Effect } from "effect";

import { assert, it } from "@effect/vitest";
import { PasswordError, verifyPassword, WebPasswordCrypto } from "@/security/password.ts";

it.effect("verifyPassword fails when the stored hash structure is malformed", () =>
  Effect.gen(function* () {
    const exit = yield* Effect.exit(verifyPassword(WebPasswordCrypto, "secret", "broken-hash"));

    assert.deepStrictEqual(exit._tag, "Failure");

    if (exit._tag === "Failure") {
      const failure = Cause.failureOption(exit.cause);
      assert.deepStrictEqual(failure._tag, "Some");

      if (failure._tag === "Some") {
        assert.ok(failure.value instanceof PasswordError);
        assert.deepStrictEqual(failure.value.message, "Invalid stored password hash");
      }
    }
  }),
);

it.effect("verifyPassword fails when the stored hash hex is invalid", () =>
  Effect.gen(function* () {
    const exit = yield* Effect.exit(
      verifyPassword(WebPasswordCrypto, "secret", "pbkdf2_sha256$310000$abcd$zz"),
    );

    assert.deepStrictEqual(exit._tag, "Failure");

    if (exit._tag === "Failure") {
      const failure = Cause.failureOption(exit.cause);
      assert.deepStrictEqual(failure._tag, "Some");

      if (failure._tag === "Some") {
        assert.ok(failure.value instanceof PasswordError);
        assert.deepStrictEqual(failure.value.message, "Invalid hash format");
      }
    }
  }),
);
