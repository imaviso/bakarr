import { Context, Effect, Encoding, Layer, Result, Schema } from "effect";

import { RandomService } from "@/infra/random.ts";

export class StreamTokenSignerError extends Schema.TaggedError<StreamTokenSignerError>()(
  "StreamTokenSignerError",
  {
    cause: Schema.optional(Schema.Defect()),
    message: Schema.String,
  },
) {}

const textEncoder = new TextEncoder();

const makeStreamTokenSigner = Effect.fn("StreamTokenSigner.make")(function* () {
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
    mediaId: number;
    unitNumber: number;
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

    return Encoding.encodeHex(new Uint8Array(signature));
  });

  const verify = Effect.fn("StreamTokenSigner.verify")(function* (input: {
    mediaId: number;
    unitNumber: number;
    expiresAt: number;
    nowMillis: number;
    signatureHex: string;
  }) {
    if (input.nowMillis > input.expiresAt) {
      return false;
    }

    const signatureBytes = Encoding.decodeHex(input.signatureHex);
    if (Result.isFailure(signatureBytes) || signatureBytes.success.length !== 32) {
      return false;
    }

    const signatureBuffer = Uint8Array.from(signatureBytes.success);

    return yield* Effect.tryPromise({
      try: () =>
        crypto.subtle.verify("HMAC", key, signatureBuffer, textEncoder.encode(toPayload(input))),
      catch: (cause) =>
        new StreamTokenSignerError({
          cause,
          message: "Failed to verify stream payload",
        }),
    });
  });

  return { sign, verify };
});

export interface StreamTokenSignerShape {
  readonly sign: (input: {
    readonly mediaId: number;
    readonly unitNumber: number;
    readonly expiresAt: number;
  }) => Effect.Effect<string, StreamTokenSignerError>;
  readonly verify: (input: {
    readonly mediaId: number;
    readonly unitNumber: number;
    readonly expiresAt: number;
    readonly nowMillis: number;
    readonly signatureHex: string;
  }) => Effect.Effect<boolean, StreamTokenSignerError>;
}

export class StreamTokenSigner extends Context.Service<StreamTokenSigner, StreamTokenSignerShape>()(
  "@bakarr/api/StreamTokenSigner",
) {
  static readonly layer = Layer.effect(StreamTokenSigner, makeStreamTokenSigner());
}

export const StreamTokenSignerLive = StreamTokenSigner.layer;

function toPayload(input: {
  readonly mediaId: number;
  readonly unitNumber: number;
  readonly expiresAt: number;
}) {
  return `${input.mediaId}:${input.unitNumber}:${input.expiresAt}`;
}
