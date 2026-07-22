import { Effect, Option, Schema } from "effect";

import { bytesToHex, hexToBytes } from "@/infra/hex.ts";
import { RandomService } from "@/infra/random.ts";

export class StreamTokenSignerError extends Schema.TaggedError<StreamTokenSignerError>()(
  "StreamTokenSignerError",
  {
    cause: Schema.optional(Schema.Defect),
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

    return bytesToHex(new Uint8Array(signature));
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

    const signatureBytes = hexToBytes(input.signatureHex);
    if (Option.isNone(signatureBytes) || signatureBytes.value.length !== 32) {
      return false;
    }

    const signatureBuffer = Uint8Array.from(signatureBytes.value);

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

export class StreamTokenSigner extends Effect.Service<StreamTokenSigner>()(
  "@bakarr/api/StreamTokenSigner",
  {
    effect: makeStreamTokenSigner(),
    dependencies: [RandomService.Default],
  },
) {}

export const StreamTokenSignerLive = StreamTokenSigner.Default;

function toPayload(input: {
  readonly mediaId: number;
  readonly unitNumber: number;
  readonly expiresAt: number;
}) {
  return `${input.mediaId}:${input.unitNumber}:${input.expiresAt}`;
}
