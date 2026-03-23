import { assertEquals, assertInstanceOf } from "@std/assert";

import { makeDefaultConfig } from "../system/defaults.ts";
import { DatabaseError } from "../../db/database.ts";
import { runTestEffectExit } from "../../test/effect-test.ts";
import {
  DownloadConflictError,
  DownloadNotFoundError,
  OperationsAnimeNotFoundError,
  OperationsPathError,
} from "./errors.ts";
import {
  maybeQBitConfig,
  tryDatabasePromise,
  wrapOperationsError,
} from "./service-support.ts";
import { QBitConfigModel } from "./qbittorrent.ts";

Deno.test("operations service support builds qBittorrent config only when enabled", () => {
  const config = {
    profiles: [],
    ...makeDefaultConfig("./test.sqlite"),
    qbittorrent: {
      default_category: "anime",
      enabled: true,
      password: "secret",
      url: "http://localhost:8080",
      username: "admin",
    },
  };

  assertEquals(
    maybeQBitConfig(config),
    new QBitConfigModel({
      baseUrl: "http://localhost:8080",
      category: "anime",
      password: "secret",
      username: "admin",
    }),
  );
  assertEquals(
    maybeQBitConfig({
      ...config,
      qbittorrent: { ...config.qbittorrent, enabled: false },
    }),
    null,
  );
});

Deno.test("operations service support preserves known errors and wraps unknown ones", async () => {
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

  const dbExit = await runTestEffectExit(
    tryDatabasePromise("db failed", () => Promise.reject(new Error("boom"))),
  );
  assertEquals(dbExit._tag, "Failure");
});
