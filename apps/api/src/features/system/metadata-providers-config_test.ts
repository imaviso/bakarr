import { Cause, Effect, Exit } from "effect";

import { assert, it } from "@effect/vitest";
import { normalizeMetadataProvidersConfig } from "@/features/system/metadata-providers-config.ts";

it("normalizes AniDB metadata provider fields", () =>
  Effect.gen(function* () {
    const normalized = yield* normalizeMetadataProvidersConfig({
      anidb: {
        client: "  BAKARR  ",
        client_version: 2,
        enabled: false,
        episode_limit: 150,
        local_port: 45553,
        password: "  pass  ",
        username: "  user  ",
      },
    });

    assert.deepStrictEqual(normalized.anidb.client, "bakarr");
    assert.deepStrictEqual(normalized.anidb.password, "pass");
    assert.deepStrictEqual(normalized.anidb.username, "user");
  }));

it("requires credentials when AniDB metadata is enabled", () =>
  Effect.gen(function* () {
    const exit = yield* Effect.exit(
      normalizeMetadataProvidersConfig({
        anidb: {
          client: "bakarr",
          client_version: 1,
          enabled: true,
          episode_limit: 200,
          local_port: 45553,
          password: null,
          username: "demo",
        },
      }),
    );

    assert.deepStrictEqual(Exit.isFailure(exit), true);
    if (Exit.isFailure(exit)) {
      const failure = Cause.failureOption(exit.cause);
      assert.deepStrictEqual(failure._tag, "Some");
      if (failure._tag === "Some") {
        assert.deepStrictEqual(failure.value._tag, "ConfigValidationError");
      }
    }
  }));

it("rejects invalid AniDB client version instead of coercing", () =>
  Effect.gen(function* () {
    const exit = yield* Effect.exit(
      normalizeMetadataProvidersConfig({
        anidb: {
          client: "bakarr",
          client_version: 0,
          enabled: false,
          episode_limit: 200,
          local_port: 45553,
          password: null,
          username: null,
        },
      }),
    );

    assert.deepStrictEqual(Exit.isFailure(exit), true);
    if (Exit.isFailure(exit)) {
      const failure = Cause.failureOption(exit.cause);
      assert.deepStrictEqual(failure._tag, "Some");
      if (failure._tag === "Some") {
        assert.deepStrictEqual(failure.value._tag, "ConfigValidationError");
        assert.match(failure.value.message, /client version/i);
      }
    }
  }));

it("rejects invalid AniDB episode limit instead of coercing", () =>
  Effect.gen(function* () {
    const exit = yield* Effect.exit(
      normalizeMetadataProvidersConfig({
        anidb: {
          client: "bakarr",
          client_version: 1,
          enabled: false,
          episode_limit: -1,
          local_port: 45553,
          password: null,
          username: null,
        },
      }),
    );

    assert.deepStrictEqual(Exit.isFailure(exit), true);
    if (Exit.isFailure(exit)) {
      const failure = Cause.failureOption(exit.cause);
      assert.deepStrictEqual(failure._tag, "Some");
      if (failure._tag === "Some") {
        assert.deepStrictEqual(failure.value._tag, "ConfigValidationError");
        assert.match(failure.value.message, /episode limit/i);
      }
    }
  }));
