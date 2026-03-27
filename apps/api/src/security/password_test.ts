import { Cause, Effect } from "effect";

import { assertEquals, assertInstanceOf, it } from "../test/vitest.ts";
import { PasswordError, verifyPassword } from "./password.ts";

it.effect("verifyPassword fails when the stored hash structure is malformed", () =>
  Effect.gen(function* () {
    const exit = yield* Effect.exit(verifyPassword("secret", "broken-hash"));

    assertEquals(exit._tag, "Failure");

    if (exit._tag === "Failure") {
      const failure = Cause.failureOption(exit.cause);
      assertEquals(failure._tag, "Some");

      if (failure._tag === "Some") {
        assertInstanceOf(failure.value, PasswordError);
        assertEquals(failure.value.message, "Invalid stored password hash");
      }
    }
  }),
);

it.effect("verifyPassword fails when the stored hash hex is invalid", () =>
  Effect.gen(function* () {
    const exit = yield* Effect.exit(verifyPassword("secret", "pbkdf2_sha256$310000$zz$zz"));

    assertEquals(exit._tag, "Failure");

    if (exit._tag === "Failure") {
      const failure = Cause.failureOption(exit.cause);
      assertEquals(failure._tag, "Some");

      if (failure._tag === "Some") {
        assertInstanceOf(failure.value, PasswordError);
        assertEquals(failure.value.message, "Invalid salt format");
      }
    }
  }),
);
