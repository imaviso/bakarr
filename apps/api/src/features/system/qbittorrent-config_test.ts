import { Cause, Effect, Exit } from "effect";

import { assert, it } from "@effect/vitest";
import { makeTestConfig } from "@/test/config-fixture.ts";
import { normalizeConfig } from "@/features/system/config-codec.ts";

it("normalizes qBittorrent config URLs", () =>
  Effect.gen(function* () {
    const config = makeTestConfig("./test.sqlite", (value) => ({
      ...value,
      qbittorrent: {
        ...value.qbittorrent,
        trusted_local: true,
        url: "HTTP://localhost:8080/",
      },
    }));

    const normalized = yield* normalizeConfig(config);

    assert.deepStrictEqual(normalized.qbittorrent.url, "http://localhost:8080");
    assert.deepStrictEqual(normalized.qbittorrent.trusted_local, true);
  }));

it("rejects loopback qBittorrent URLs when trusted_local is disabled", () =>
  Effect.gen(function* () {
    const config = makeTestConfig("./test.sqlite", (value) => ({
      ...value,
      qbittorrent: {
        ...value.qbittorrent,
        trusted_local: false,
        url: "http://127.0.0.1:8080",
      },
    }));

    const exit = yield* Effect.exit(normalizeConfig(config));

    assert.deepStrictEqual(Exit.isFailure(exit), true);
    if (Exit.isFailure(exit)) {
      const failure = Cause.failureOption(exit.cause);
      assert.deepStrictEqual(failure._tag, "Some");
      if (failure._tag === "Some") {
        assert.deepStrictEqual(failure.value._tag, "ConfigValidationError");
      }
    }
  }));

it("rejects qBittorrent URLs with credentials as typed validation failures", () =>
  Effect.gen(function* () {
    const config = makeTestConfig("./test.sqlite", (value) => ({
      ...value,
      qbittorrent: {
        ...value.qbittorrent,
        url: "https://demo:secret@qbit.example",
      },
    }));

    const exit = yield* Effect.exit(normalizeConfig(config));

    assert.deepStrictEqual(Exit.isFailure(exit), true);
    if (Exit.isFailure(exit)) {
      const failure = Cause.failureOption(exit.cause);
      assert.deepStrictEqual(failure._tag, "Some");
      if (failure._tag === "Some") {
        assert.deepStrictEqual(failure.value._tag, "ConfigValidationError");
        assert.deepStrictEqual(
          failure.value.message,
          "qBittorrent URL must not include credentials",
        );
      }
    }
  }));
