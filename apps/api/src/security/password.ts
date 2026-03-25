import { Effect, Schema } from "effect";
import { randomBytes } from "../lib/random.ts";

const PASSWORD_SCHEME = "pbkdf2_sha256";
const ITERATIONS = 310_000;
const KEY_LENGTH = 32;

export class PasswordError extends Schema.TaggedError<PasswordError>()("PasswordError", {
  message: Schema.String,
}) {}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.length);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
}

function fromHex(value: string): Uint8Array {
  if (value.length % 2 !== 0) {
    throw new Error("Invalid hex input");
  }

  const bytes = new Uint8Array(value.length / 2);

  for (let index = 0; index < value.length; index += 2) {
    bytes[index / 2] = Number.parseInt(value.slice(index, index + 2), 16);
  }

  return bytes;
}

function timingSafeEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) {
    return false;
  }

  let result = 0;

  for (let index = 0; index < left.length; index += 1) {
    result |= left[index] ^ right[index];
  }

  return result === 0;
}

const deriveKeyMaterial = Effect.fn("Password.deriveKeyMaterial")(function* (password: string) {
  const keyMaterial = yield* Effect.tryPromise({
    try: () =>
      crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, [
        "deriveBits",
      ]),
    catch: () => new PasswordError({ message: "Failed to import key material" }),
  });
  return keyMaterial;
});

const deriveBits = Effect.fn("Password.deriveBits")(function* (
  keyMaterial: CryptoKey,
  salt: ArrayBuffer,
  iterations: number,
) {
  const bits = yield* Effect.tryPromise({
    try: () =>
      crypto.subtle.deriveBits(
        {
          hash: "SHA-256",
          iterations,
          name: "PBKDF2",
          salt,
        },
        keyMaterial,
        KEY_LENGTH * 8,
      ),
    catch: () => new PasswordError({ message: "Failed to derive password hash" }),
  });
  return new Uint8Array(bits);
});

export const hashPassword = Effect.fn("Password.hash")(function* (password: string) {
  const salt = yield* randomBytes(16);
  const keyMaterial = yield* deriveKeyMaterial(password);
  const hash = yield* deriveBits(keyMaterial, toArrayBuffer(salt), ITERATIONS);

  return [PASSWORD_SCHEME, String(ITERATIONS), toHex(salt), toHex(hash)].join("$");
});

export const verifyPassword = Effect.fn("Password.verify")(function* (
  password: string,
  storedHash: string,
) {
  const parts = storedHash.split("$");

  if (parts.length !== 4) {
    return false;
  }

  const [scheme, iterationsValue, saltHex, hashHex] = parts;

  if (scheme !== PASSWORD_SCHEME || !iterationsValue || !saltHex || !hashHex) {
    return false;
  }

  const iterations = Number(iterationsValue);

  if (!Number.isInteger(iterations) || iterations <= 0) {
    return false;
  }

  const salt = yield* Effect.try({
    try: () => fromHex(saltHex),
    catch: () => new PasswordError({ message: "Invalid salt format" }),
  });

  const expected = yield* Effect.try({
    try: () => fromHex(hashHex),
    catch: () => new PasswordError({ message: "Invalid hash format" }),
  });

  const keyMaterial = yield* deriveKeyMaterial(password);
  const actual = yield* deriveBits(keyMaterial, toArrayBuffer(salt), iterations);

  return timingSafeEqual(expected, actual);
});
