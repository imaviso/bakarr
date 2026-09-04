import { Cause, Effect, Encoding } from "effect";
import { assert, it } from "@effect/vitest";

import {
  hashPassword,
  PasswordError,
  verifyPassword,
  WebPasswordCrypto,
} from "@/security/password.ts";

it.effect("verifyPassword fails when the stored hash structure is malformed", () =>
  Effect.gen(function* () {
    const exit = yield* Effect.exit(verifyPassword(WebPasswordCrypto, "secret", "broken-hash"));

    assert.deepStrictEqual(exit._tag, "Failure");

    if (exit._tag === "Failure") {
      const failure = Cause.findErrorOption(exit.cause);
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
      const failure = Cause.findErrorOption(exit.cause);
      assert.deepStrictEqual(failure._tag, "Some");

      if (failure._tag === "Some") {
        assert.ok(failure.value instanceof PasswordError);
      }
    }
  }),
);

it.effect("hashPassword embeds the current iteration count and verifies", () =>
  Effect.gen(function* () {
    const storedHash = yield* hashPassword(WebPasswordCrypto, "correct horse battery staple");

    const [scheme, iterations] = storedHash.split("$");

    assert.deepStrictEqual(scheme, "pbkdf2_sha256");
    assert.deepStrictEqual(Number(iterations), 600_000);
    assert.deepStrictEqual(
      yield* verifyPassword(WebPasswordCrypto, "correct horse battery staple", storedHash),
      true,
    );
    assert.deepStrictEqual(yield* verifyPassword(WebPasswordCrypto, "wrong", storedHash), false);
  }),
);

it.effect("hashes written with older iteration counts still verify", () =>
  Effect.gen(function* () {
    // Simulate a hash written before the iteration bump by deriving at 310_000.
    const salt = yield* WebPasswordCrypto.randomBytes(16);
    const keyMaterial = yield* WebPasswordCrypto.deriveKeyMaterial("legacy");
    const hash = yield* WebPasswordCrypto.deriveBits(
      keyMaterial,
      Uint8Array.from(salt).buffer,
      310_000,
    );
    const legacyStoredHash = [
      "pbkdf2_sha256",
      "310000",
      Encoding.encodeHex(salt),
      Encoding.encodeHex(hash),
    ].join("$");

    assert.deepStrictEqual(
      yield* verifyPassword(WebPasswordCrypto, "legacy", legacyStoredHash),
      true,
    );
    assert.deepStrictEqual(
      yield* verifyPassword(WebPasswordCrypto, "wrong", legacyStoredHash),
      false,
    );
  }),
);
