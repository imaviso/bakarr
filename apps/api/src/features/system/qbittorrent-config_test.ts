import { Cause, Effect, Exit } from "effect";

import { assertEquals, it } from "../../test/vitest.ts";
import { makeTestConfig } from "../../test/config-fixture.ts";
import { normalizeConfig } from "./qbittorrent-config.ts";

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

    assertEquals(normalized.qbittorrent.url, "http://localhost:8080");
    assertEquals(normalized.qbittorrent.trusted_local, true);
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

    assertEquals(Exit.isFailure(exit), true);
    if (Exit.isFailure(exit)) {
      const failure = Cause.failureOption(exit.cause);
      assertEquals(failure._tag, "Some");
      if (failure._tag === "Some") {
        assertEquals(failure.value._tag, "ConfigValidationError");
      }
    }
  }));
