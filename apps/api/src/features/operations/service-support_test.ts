import { assertEquals, assertInstanceOf, it } from "../../test/vitest.ts";
import { Effect } from "effect";

import { makeTestConfig } from "../../test/config-fixture.ts";
import { DatabaseError } from "../../db/database.ts";
import { tryDatabasePromise } from "../../lib/effect-db.ts";
import {
  DownloadConflictError,
  DownloadNotFoundError,
  OperationsAnimeNotFoundError,
  OperationsPathError,
} from "./errors.ts";
import { maybeQBitConfig, wrapOperationsError } from "./service-support.ts";
import { QBitConfigModel } from "./qbittorrent.ts";

it("operations service support builds qBittorrent config only when enabled", () => {
  const config = makeTestConfig("./test.sqlite", (c) => ({
    ...c,
    qbittorrent: {
      default_category: "anime",
      enabled: true,
      password: "secret",
      url: "http://localhost:8080",
      username: "admin",
    },
  }));

  assertEquals(
    maybeQBitConfig(config),
    new QBitConfigModel({
      baseUrl: "http://localhost:8080",
      category: "anime",
      password: "secret",
      username: "admin",
    }),
  );

  const disabledConfig = makeTestConfig("./test.sqlite", (c) => ({
    ...c,
    qbittorrent: { ...config.qbittorrent, enabled: false },
  }));
  assertEquals(maybeQBitConfig(disabledConfig), null);
});

it.effect("operations service support preserves known errors and wraps unknown ones", () =>
  Effect.gen(function* () {
    const knownNotFound = new DownloadNotFoundError({ message: "missing" });
    const knownConflict = new DownloadConflictError({ message: "conflict" });
    const knownAnime = new OperationsAnimeNotFoundError({ message: "anime" });
    const knownPath = new OperationsPathError({ message: "path" });
    const knownDb = new DatabaseError({ cause: new Error("db"), message: "db" });

    assertEquals(wrapOperationsError("ignored")(knownNotFound), knownNotFound);
    assertEquals(wrapOperationsError("ignored")(knownConflict), knownConflict);
    assertEquals(wrapOperationsError("ignored")(knownAnime), knownAnime);
    assertEquals(wrapOperationsError("ignored")(knownPath), knownPath);
    assertEquals(wrapOperationsError("ignored")(knownDb), knownDb);

    const wrapped = wrapOperationsError("wrapped")(new Error("boom"));
    assertInstanceOf(wrapped, DatabaseError);
    assertEquals(wrapped.message, "wrapped");

    const dbExit = yield* Effect.exit(
      tryDatabasePromise("db failed", () => Promise.reject(new Error("boom"))),
    );
    assertEquals(dbExit._tag, "Failure");
  }),
);
