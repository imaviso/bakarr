import { Cause, Effect, Exit } from "effect";

import { assertEquals, it } from "../../test/vitest.ts";
import { makeTestConfig } from "../../test/config-fixture.ts";
import { validateConfigUpdate } from "./config-update-validation.ts";

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

    assertEquals(Exit.isFailure(exit), true);

    if (Exit.isFailure(exit)) {
      const failure = Cause.failureOption(exit.cause);
      assertEquals(failure._tag, "Some");
      if (failure._tag === "Some") {
        assertEquals(failure.value._tag, "ConfigValidationError");
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

    assertEquals(Exit.isFailure(exit), true);

    if (Exit.isFailure(exit)) {
      const failure = Cause.failureOption(exit.cause);
      assertEquals(failure._tag, "Some");
      if (failure._tag === "Some") {
        assertEquals(failure.value._tag, "ConfigValidationError");
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

    assertEquals(Exit.isFailure(exit), true);

    if (Exit.isFailure(exit)) {
      const failure = Cause.failureOption(exit.cause);
      assertEquals(failure._tag, "Some");
      if (failure._tag === "Some") {
        assertEquals(failure.value._tag, "ConfigValidationError");
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

    assertEquals(Exit.isFailure(exit), true);

    if (Exit.isFailure(exit)) {
      const failure = Cause.failureOption(exit.cause);
      assertEquals(failure._tag, "Some");
      if (failure._tag === "Some") {
        assertEquals(failure.value._tag, "ConfigValidationError");
      }
    }
  }));
