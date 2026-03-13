import { assertEquals, assertInstanceOf } from "@std/assert";
import { Effect } from "effect";

import { DatabaseError } from "../../db/database.ts";
import { AnimeConflictError, AnimeNotFoundError } from "./errors.ts";
import {
  tryAnimePromise,
  tryDatabasePromise,
  wrapAnimeError,
} from "./service-support.ts";

Deno.test("anime service support preserves known errors and wraps unknown ones", async () => {
  const knownNotFound = new AnimeNotFoundError({ message: "missing" });
  const knownConflict = new AnimeConflictError({ message: "conflict" });
  const knownDb = new DatabaseError({ cause: new Error("db"), message: "db" });

  assertEquals(wrapAnimeError("ignored")(knownNotFound), knownNotFound);
  assertEquals(wrapAnimeError("ignored")(knownConflict), knownConflict);
  assertEquals(wrapAnimeError("ignored")(knownDb), knownDb);

  const wrapped = wrapAnimeError("wrapped")(new Error("boom"));
  assertInstanceOf(wrapped, DatabaseError);
  assertEquals(wrapped.message, "wrapped");

  const dbExit = await Effect.runPromiseExit(
    tryDatabasePromise("db failed", () => Promise.reject(new Error("boom"))),
  );
  assertEquals(dbExit._tag, "Failure");

  const animeExit = await Effect.runPromiseExit(
    tryAnimePromise("anime failed", () => Promise.reject(new Error("boom"))),
  );
  assertEquals(animeExit._tag, "Failure");
});
