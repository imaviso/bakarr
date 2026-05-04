import { Cause, Effect, Exit } from "effect";

import { assert, it } from "@effect/vitest";
import { makeTestConfig } from "@/test/config-fixture.ts";
import { validateConfigUpdate } from "@/features/system/config-update-validation.ts";

it("rejects invalid scheduler cron expressions", () =>
  Effect.gen(function* () {
    const exit = yield* Effect.exit(
      validateConfigUpdate({
        countAnimeUsingProfile: () => Effect.succeed(0),
        existingProfileRows: [],
        nextConfig: makeTestConfig("./test.sqlite", (config) => ({
          ...config,
          scheduler: {
            ...config.scheduler,
            cron_expression: "not a cron",
            enabled: true,
          },
        })),
      }),
    );

    assert.deepStrictEqual(Exit.isFailure(exit), true);

    if (Exit.isFailure(exit)) {
      const failure = Cause.failureOption(exit.cause);
      assert.deepStrictEqual(failure._tag, "Some");
      if (failure._tag === "Some") {
        assert.deepStrictEqual(failure.value._tag, "ConfigValidationError");
        assert.match(failure.value.message, /Invalid scheduler cron expression/);
      }
    }
  }));

it("rejects removing profiles that are still referenced", () =>
  Effect.gen(function* () {
    const exit = yield* Effect.exit(
      validateConfigUpdate({
        countAnimeUsingProfile: (profileName) => Effect.succeed(profileName === "legacy" ? 2 : 0),
        existingProfileRows: [{ name: "legacy" }, { name: "keep" }],
        nextConfig: makeTestConfig("./test.sqlite"),
      }),
    );

    assert.deepStrictEqual(Exit.isFailure(exit), true);

    if (Exit.isFailure(exit)) {
      const failure = Cause.failureOption(exit.cause);
      assert.deepStrictEqual(failure._tag, "Some");
      if (failure._tag === "Some") {
        assert.deepStrictEqual(failure.value._tag, "ConfigValidationError");
        assert.match(failure.value.message, /Cannot remove profile 'legacy'/);
      }
    }
  }));

it("rejects invalid qBittorrent URLs", () =>
  Effect.gen(function* () {
    const exit = yield* Effect.exit(
      validateConfigUpdate({
        countAnimeUsingProfile: () => Effect.succeed(0),
        existingProfileRows: [],
        nextConfig: makeTestConfig("./test.sqlite", (config) => ({
          ...config,
          qbittorrent: {
            ...config.qbittorrent,
            url: "ftp://localhost:8080",
          },
        })),
      }),
    );

    assert.deepStrictEqual(Exit.isFailure(exit), true);

    if (Exit.isFailure(exit)) {
      const failure = Cause.failureOption(exit.cause);
      assert.deepStrictEqual(failure._tag, "Some");
      if (failure._tag === "Some") {
        assert.deepStrictEqual(failure.value._tag, "ConfigValidationError");
        assert.match(failure.value.message, /must use http or https/);
      }
    }
  }));

it("rejects private qBittorrent URLs when trusted_local is disabled", () =>
  Effect.gen(function* () {
    const exit = yield* Effect.exit(
      validateConfigUpdate({
        countAnimeUsingProfile: () => Effect.succeed(0),
        existingProfileRows: [],
        nextConfig: makeTestConfig("./test.sqlite", (config) => ({
          ...config,
          qbittorrent: {
            ...config.qbittorrent,
            trusted_local: false,
            url: "http://127.0.0.1:8080",
          },
        })),
      }),
    );

    assert.deepStrictEqual(Exit.isFailure(exit), true);

    if (Exit.isFailure(exit)) {
      const failure = Cause.failureOption(exit.cause);
      assert.deepStrictEqual(failure._tag, "Some");
      if (failure._tag === "Some") {
        assert.deepStrictEqual(failure.value._tag, "ConfigValidationError");
        assert.match(failure.value.message, /trusted_local/);
      }
    }
  }));
