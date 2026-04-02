import { Effect } from "effect";

import { TokenHasher, TokenHasherLive } from "@/security/token-hasher.ts";
import { assertEquals, assertMatch, assertNotEquals, it } from "@/test/vitest.ts";

it.effect("TokenHasher produces stable SHA-256 hex digests", () =>
  Effect.gen(function* () {
    const token = "bakarr-session-token";

    const first = yield* Effect.flatMap(TokenHasher, (hasher) => hasher.hashToken(token)).pipe(
      Effect.provide(TokenHasherLive),
    );
    const second = yield* Effect.flatMap(TokenHasher, (hasher) => hasher.hashToken(token)).pipe(
      Effect.provide(TokenHasherLive),
    );
    const different = yield* Effect.flatMap(TokenHasher, (hasher) =>
      hasher.hashToken("bakarr-session-token-2"),
    ).pipe(Effect.provide(TokenHasherLive));

    assertEquals(first, second);
    assertEquals(first.length, 64);
    assertMatch(first, /^[0-9a-f]{64}$/);
    assertNotEquals(first, different);
  }),
);
