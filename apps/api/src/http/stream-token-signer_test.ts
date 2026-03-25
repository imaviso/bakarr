import { Effect, Layer } from "effect";

import { RandomService } from "../lib/random.ts";
import { assertEquals, it } from "../test/vitest.ts";
import { StreamTokenSigner, StreamTokenSignerLive } from "./stream-token-signer.ts";

const randomLayer = Layer.succeed(RandomService, {
  randomBytes: () => Effect.succeed(new Uint8Array(32).fill(7)),
  randomUuid: Effect.succeed("test-uuid"),
});

it.effect("StreamTokenSigner signs and verifies matching stream payloads", () =>
  Effect.gen(function* () {
    const signer = yield* StreamTokenSigner;
    const signature = yield* signer.sign({
      animeId: 42,
      episodeNumber: 7,
      expiresAt: 2_000,
    });

    const isValid = yield* signer.verify({
      animeId: 42,
      episodeNumber: 7,
      expiresAt: 2_000,
      nowMillis: 1_500,
      signatureHex: signature,
    });

    assertEquals(isValid, true);
  }).pipe(Effect.provide(StreamTokenSignerLive.pipe(Layer.provide(randomLayer)))),
);

it.effect("StreamTokenSigner rejects expired stream payloads", () =>
  Effect.gen(function* () {
    const signer = yield* StreamTokenSigner;
    const signature = yield* signer.sign({
      animeId: 42,
      episodeNumber: 7,
      expiresAt: 2_000,
    });

    const isValid = yield* signer.verify({
      animeId: 42,
      episodeNumber: 7,
      expiresAt: 2_000,
      nowMillis: 2_001,
      signatureHex: signature,
    });

    assertEquals(isValid, false);
  }).pipe(Effect.provide(StreamTokenSignerLive.pipe(Layer.provide(randomLayer)))),
);
