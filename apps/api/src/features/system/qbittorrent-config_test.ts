import { Effect } from "effect";

import { assertEquals, it } from "../../test/vitest.ts";
import { makeTestConfig } from "../../test/config-fixture.ts";
import { normalizeConfig } from "./qbittorrent-config.ts";

it("normalizes qBittorrent config URLs", () =>
  Effect.gen(function* () {
    const config = makeTestConfig("./test.sqlite", (value) => ({
      ...value,
      qbittorrent: {
        ...value.qbittorrent,
        url: "HTTP://localhost:8080/",
      },
    }));

    const normalized = yield* normalizeConfig(config);

    assertEquals(normalized.qbittorrent.url, "http://localhost:8080");
  }));
