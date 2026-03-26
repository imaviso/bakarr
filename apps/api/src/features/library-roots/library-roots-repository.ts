import { asc } from "drizzle-orm";
import { Effect } from "effect";

import { Database } from "../../db/database.ts";
import { libraryRoots } from "../../db/schema.ts";
import { tryDatabasePromise } from "../../lib/effect-db.ts";

export const listLibraryRoots = Effect.fn("LibraryRootsRepository.list")(function* () {
  const { db } = yield* Database;

  return yield* tryDatabasePromise("Failed to load library roots", () =>
    db.select().from(libraryRoots).orderBy(asc(libraryRoots.label)),
  );
});
