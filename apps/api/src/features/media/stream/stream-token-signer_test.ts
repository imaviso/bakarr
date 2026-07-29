import { assert, it } from "@effect/vitest";
import { Effect, Layer } from "effect";

import {
  StreamTokenSigner,
  StreamTokenSignerError,
  StreamTokenSignerLive,
} from "@/features/media/stream/stream-token-signer.ts";
import { RandomService } from "@/infra/random.ts";

const randomLayer = Layer.succeed(RandomService, {
  randomBytes: (bytes: number) => Effect.succeed(new Uint8Array(bytes).fill(7)),
  randomUuid: Effect.succeed("test-uuid"),
});

it("StreamTokenSignerError constructs", () => {
  const error = new StreamTokenSignerError({ message: "sign failed" });
  assert.deepStrictEqual(error._tag, "StreamTokenSignerError");
  assert.deepStrictEqual(error.message, "sign failed");
});

it("StreamTokenSignerError constructs with cause", () => {
  const cause = new Error("crypto");
  const error = new StreamTokenSignerError({ cause, message: "crypto failed" });
  assert.deepStrictEqual(error.message, "crypto failed");
});

it.effect("StreamTokenSigner verifies matching payloads and rejects tampering", () =>
  Effect.gen(function* () {
    const signer = yield* StreamTokenSigner;
    const signatureHex = yield* signer.sign({ mediaId: 42, unitNumber: 7, expiresAt: 2_000 });

    const valid = yield* signer.verify({
      mediaId: 42,
      unitNumber: 7,
      expiresAt: 2_000,
      nowMillis: 1_999,
      signatureHex,
    });
    const wrongAnime = yield* signer.verify({
      mediaId: 43,
      unitNumber: 7,
      expiresAt: 2_000,
      nowMillis: 1_999,
      signatureHex,
    });
    const malformed = yield* signer.verify({
      mediaId: 42,
      unitNumber: 7,
      expiresAt: 2_000,
      nowMillis: 1_999,
      signatureHex: "not-hex",
    });

    assert.deepStrictEqual(valid, true);
    assert.deepStrictEqual(wrongAnime, false);
    assert.deepStrictEqual(malformed, false);
  }).pipe(Effect.provide(StreamTokenSignerLive.pipe(Layer.provide(randomLayer)))),
);
