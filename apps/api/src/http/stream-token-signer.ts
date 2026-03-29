import { Context, Effect, Layer, Schema } from "effect";

import { RandomService } from "@/lib/random.ts";

export class StreamTokenSignerError extends Schema.TaggedError<StreamTokenSignerError>()(
  "StreamTokenSignerError",
  {
    cause: Schema.optional(Schema.Defect),
    message: Schema.String,
  },
) {}

export interface StreamTokenSignerShape {
  readonly sign: (input: {
    readonly animeId: number;
    readonly episodeNumber: number;
    readonly expiresAt: number;
  }) => Effect.Effect<string, StreamTokenSignerError>;
  readonly verify: (input: {
    readonly animeId: number;
    readonly episodeNumber: number;
    readonly expiresAt: number;
    readonly nowMillis: number;
    readonly signatureHex: string;
  }) => Effect.Effect<boolean, StreamTokenSignerError>;
}

export class StreamTokenSigner extends Context.Tag("@bakarr/api/StreamTokenSigner")<
  StreamTokenSigner,
  StreamTokenSignerShape
>() {}

const textEncoder = new TextEncoder();

export const StreamTokenSignerLive = Layer.effect(
  StreamTokenSigner,
  Effect.gen(function* () {
    const random = yield* RandomService;
    const secret = yield* random.randomBytes(32);
    const secretBuffer = Uint8Array.from(secret).buffer;
    const key = yield* Effect.tryPromise({
      try: () =>
        crypto.subtle.importKey("raw", secretBuffer, { name: "HMAC", hash: "SHA-256" }, false, [
          "sign",
          "verify",
        ]),
      catch: (cause) =>
        new StreamTokenSignerError({
          cause,
          message: "Failed to initialize stream token signer",
        }),
    });

    const sign = Effect.fn("StreamTokenSigner.sign")(function* (input: {
      animeId: number;
      episodeNumber: number;
      expiresAt: number;
    }) {
      const signature = yield* Effect.tryPromise({
        try: () => crypto.subtle.sign("HMAC", key, textEncoder.encode(toPayload(input))),
        catch: (cause) =>
          new StreamTokenSignerError({
            cause,
            message: "Failed to sign stream payload",
          }),
      });

      return bytesToHex(new Uint8Array(signature));
    });

    const verify = Effect.fn("StreamTokenSigner.verify")(function* (input: {
      animeId: number;
      episodeNumber: number;
      expiresAt: number;
      nowMillis: number;
      signatureHex: string;
    }) {
      if (input.nowMillis > input.expiresAt) {
        return false;
      }

      const signatureBytes = hexToBytes(input.signatureHex);
      if (signatureBytes === null || signatureBytes.length !== 32) {
        return false;
      }

      return yield* Effect.tryPromise({
        try: () =>
          crypto.subtle.verify("HMAC", key, signatureBytes, textEncoder.encode(toPayload(input))),
        catch: (cause) =>
          new StreamTokenSignerError({
            cause,
            message: "Failed to verify stream payload",
          }),
      });
    });

    return StreamTokenSigner.of({ sign, verify });
  }),
);

function toPayload(input: {
  readonly animeId: number;
  readonly episodeNumber: number;
  readonly expiresAt: number;
}) {
  return `${input.animeId}:${input.episodeNumber}:${input.expiresAt}`;
}

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(value: string) {
  if (value.length % 2 !== 0 || /[^0-9a-f]/i.test(value)) {
    return null;
  }

  const bytes = new Uint8Array(value.length / 2);

  for (let index = 0; index < value.length; index += 2) {
    const byte = Number.parseInt(value.slice(index, index + 2), 16);
    if (Number.isNaN(byte)) {
      return null;
    }
    bytes[index / 2] = byte;
  }

  return bytes;
}
