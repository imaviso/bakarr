import { Effect, Schema } from "effect";

import { bytesToHex } from "@/infra/hex.ts";

export class TokenHasherError extends Schema.TaggedError<TokenHasherError>()("TokenHasherError", {
  cause: Schema.optional(Schema.Defect),
  message: Schema.String,
}) {}

export interface TokenHasherShape {
  readonly hashToken: (token: string) => Effect.Effect<string, TokenHasherError>;
}

const textEncoder = new TextEncoder();

const hashToken = Effect.fn("TokenHasher.hashToken")(function* (token: string) {
  const data = textEncoder.encode(token);
  const hashBuffer = yield* Effect.tryPromise({
    try: () => crypto.subtle.digest("SHA-256", data),
    catch: (cause) =>
      new TokenHasherError({
        cause,
        message: "Failed to hash token",
      }),
  });

  return bytesToHex(new Uint8Array(hashBuffer));
});

export class TokenHasher extends Effect.Service<TokenHasher>()("@bakarr/security/TokenHasher", {
  succeed: { hashToken },
}) {}
