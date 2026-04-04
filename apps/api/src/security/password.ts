import { Effect, Schema } from "effect";
import { timingSafeEqual as nodeTimingSafeEqual } from "node:crypto";

const PASSWORD_SCHEME = "pbkdf2_sha256";
const ITERATIONS = 310_000;
const KEY_LENGTH = 32;

export class PasswordError extends Schema.TaggedError<PasswordError>()("PasswordError", {
  cause: Schema.optional(Schema.Defect),
  message: Schema.String,
}) {}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.length);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

function toHex(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("hex");
}

function timingSafeEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) {
    return false;
  }

  return nodeTimingSafeEqual(Buffer.from(left), Buffer.from(right));
}

const deriveKeyMaterial = Effect.fn("Password.deriveKeyMaterial")(function* (password: string) {
  const keyMaterial = yield* Effect.tryPromise({
    try: () =>
      crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, [
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
    catch: (cause) =>
      new PasswordError({
        cause,
        message: "Failed to derive password hash",
      }),
  });
  return new Uint8Array(bits);
});

const parseHex = Effect.fn("Password.parseHex")(function* (value: string, message: string) {
  if (value.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(value)) {
    return yield* new PasswordError({ message });
  }

  return Uint8Array.from(Buffer.from(value, "hex"));
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
  const salt = yield* randomBytesEffect(16);
  const keyMaterial = yield* deriveKeyMaterial(password);
  const hash = yield* deriveBits(keyMaterial, toArrayBuffer(salt), ITERATIONS);

  return [PASSWORD_SCHEME, String(ITERATIONS), toHex(salt), toHex(hash)].join("$");
});

export const verifyPassword = Effect.fn("Password.verify")(function* (
  password: string,
  storedHash: string,
) {
  const { hash: expected, iterations, salt } = yield* parseStoredHash(storedHash);

  const keyMaterial = yield* deriveKeyMaterial(password);
  const actual = yield* deriveBits(keyMaterial, toArrayBuffer(salt), iterations);

  return timingSafeEqual(expected, actual);
});

function makeHashPasswordWith(randomBytes: (bytes: number) => Effect.Effect<Uint8Array>) {
  return Effect.fn("Password.hashWith")(function* (password: string) {
    const salt = yield* randomBytes(16);
    const keyMaterial = yield* deriveKeyMaterial(password);
    const hash = yield* deriveBits(keyMaterial, toArrayBuffer(salt), ITERATIONS);

    return [PASSWORD_SCHEME, String(ITERATIONS), toHex(salt), toHex(hash)].join("$");
  });
}

export const hashPasswordWith = (randomBytes: (bytes: number) => Effect.Effect<Uint8Array>) =>
  makeHashPasswordWith(randomBytes);

const randomBytesEffect = (bytes: number) =>
  Effect.sync(() => {
    const data = new Uint8Array(bytes);
    crypto.getRandomValues(data);
    return data;
  });
