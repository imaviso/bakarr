import { Effect } from "effect";

import { TokenHasher } from "@/security/token-hasher.ts";
import { assert, it } from "@effect/vitest";

it.effect("TokenHasher produces stable SHA-256 hex digests", () =>
  Effect.gen(function* () {
    const token = "bakarr-session-token";

    const first = yield* Effect.flatMap(TokenHasher, (hasher) => hasher.hashToken(token)).pipe(
      Effect.provide(TokenHasher.Default),
    );
    const second = yield* Effect.flatMap(TokenHasher, (hasher) => hasher.hashToken(token)).pipe(
      Effect.provide(TokenHasher.Default),
    );
    const different = yield* Effect.flatMap(TokenHasher, (hasher) =>
      hasher.hashToken("bakarr-session-token-2"),
    ).pipe(Effect.provide(TokenHasher.Default));

    assert.deepStrictEqual(first, second);
    assert.deepStrictEqual(first.length, 64);
    assert.match(first, /^[0-9a-f]{64}$/);
    assert.deepStrictEqual(first === different, false);
  }),
);
