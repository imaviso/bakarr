import { Context, Effect, Layer, Option, Schema } from "effect";
import { timingSafeEqual as nodeTimingSafeEqual } from "node:crypto";

import { bytesToHex, hexToBytes } from "@/infra/hex.ts";

const PASSWORD_SCHEME = "pbkdf2_sha256";
const ITERATIONS = 310_000;
const KEY_LENGTH = 32;

export interface PasswordCryptoPrimitives {
  readonly deriveBits: (
    algorithm: Pbkdf2Params,
    keyMaterial: CryptoKey,
    length: number,
  ) => Promise<ArrayBuffer>;
  readonly getRandomValues: (data: Uint8Array<ArrayBuffer>) => Uint8Array<ArrayBuffer>;
  readonly importKey: (
    format: "raw",
    keyData: BufferSource,
    algorithm: "PBKDF2",
    extractable: boolean,
    keyUsages: readonly KeyUsage[],
  ) => Promise<CryptoKey>;
}

export const WebPasswordCrypto: PasswordCryptoPrimitives = {
  deriveBits: (algorithm, keyMaterial, length) =>
    crypto.subtle.deriveBits(algorithm, keyMaterial, length),
  getRandomValues: (data) => {
    crypto.getRandomValues(data);
    return data;
  },
  importKey: (format, keyData, algorithm, extractable, keyUsages) =>
    crypto.subtle.importKey(format, keyData, algorithm, extractable, [...keyUsages]),
};

export class PasswordCrypto extends Context.Tag("@bakarr/security/PasswordCrypto")<
  PasswordCrypto,
  PasswordCryptoPrimitives
>() {}

export const PasswordCryptoLive = Layer.succeed(PasswordCrypto, WebPasswordCrypto);

export class PasswordError extends Schema.TaggedError<PasswordError>()("PasswordError", {
  cause: Schema.optional(Schema.Defect),
  message: Schema.String,
}) {}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.length);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

function timingSafeEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) {
    return false;
  }

  return nodeTimingSafeEqual(Buffer.from(left), Buffer.from(right));
}

const deriveKeyMaterial = Effect.fn("Password.deriveKeyMaterial")(function* (
  primitives: PasswordCryptoPrimitives,
  password: string,
) {
  const keyMaterial = yield* Effect.tryPromise({
    try: () =>
      primitives.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, [
        "deriveBits",
      ]),
    catch: (cause) =>
      new PasswordError({
        cause,
        message: "Failed to import key material",
      }),
  });
  return keyMaterial;
});

const deriveBits = Effect.fn("Password.deriveBits")(function* (
  primitives: PasswordCryptoPrimitives,
  keyMaterial: CryptoKey,
  salt: ArrayBuffer,
  iterations: number,
) {
  const bits = yield* Effect.tryPromise({
    try: () =>
      primitives.deriveBits(
        {
          hash: "SHA-256",
          iterations,
          name: "PBKDF2",
          salt,
        },
        keyMaterial,
        KEY_LENGTH * 8,
      ),
    catch: (cause) =>
      new PasswordError({
        cause,
        message: "Failed to derive password hash",
      }),
  });
  return new Uint8Array(bits);
});

const parseHex = Effect.fn("Password.parseHex")(function* (value: string, message: string) {
  const decoded = hexToBytes(value);

  if (Option.isNone(decoded)) {
    return yield* new PasswordError({ message });
  }

  return decoded.value;
});

const parseStoredHash = Effect.fn("Password.parseStoredHash")(function* (storedHash: string) {
  const parts = storedHash.split("$");

  if (parts.length !== 4) {
    return yield* new PasswordError({ message: "Invalid stored password hash" });
  }

  const [scheme, iterationsValue, saltHex, hashHex] = parts;

  if (scheme !== PASSWORD_SCHEME || !iterationsValue || !saltHex || !hashHex) {
    return yield* new PasswordError({ message: "Invalid stored password hash" });
  }

  const iterations = Number(iterationsValue);

  if (!Number.isInteger(iterations) || iterations <= 0) {
    return yield* new PasswordError({ message: "Invalid stored password hash" });
  }

  const salt = yield* parseHex(saltHex, "Invalid salt format");
  const hash = yield* parseHex(hashHex, "Invalid hash format");

  return {
    hash,
    iterations,
    salt,
  };
});

export const hashPassword = Effect.fn("Password.hash")(function* (password: string) {
  const primitives = yield* PasswordCrypto;
  const salt = yield* randomBytesEffect(primitives, 16);
  const keyMaterial = yield* deriveKeyMaterial(primitives, password);
  const hash = yield* deriveBits(primitives, keyMaterial, toArrayBuffer(salt), ITERATIONS);

  return [PASSWORD_SCHEME, String(ITERATIONS), bytesToHex(salt), bytesToHex(hash)].join("$");
});

export const verifyPassword = Effect.fn("Password.verify")(function* (
  password: string,
  storedHash: string,
) {
  const { hash: expected, iterations, salt } = yield* parseStoredHash(storedHash);
  const primitives = yield* PasswordCrypto;
  const keyMaterial = yield* deriveKeyMaterial(primitives, password);
  const actual = yield* deriveBits(primitives, keyMaterial, toArrayBuffer(salt), iterations);

  return timingSafeEqual(expected, actual);
});

const randomBytesEffect = (primitives: PasswordCryptoPrimitives, bytes: number) =>
  Effect.try({
    try: () => {
      const data = new Uint8Array(bytes);
      primitives.getRandomValues(data);
      return data;
    },
    catch: (cause) =>
      new PasswordError({
        cause,
        message: "Failed to generate password salt",
      }),
  });
