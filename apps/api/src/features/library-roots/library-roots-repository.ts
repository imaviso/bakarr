import { Effect } from "effect";
import { asc } from "drizzle-orm";

import { Database, DatabaseError } from "../../db/database.ts";
import { libraryRoots } from "../../db/schema.ts";

export const listLibraryRoots = Effect.fn("LibraryRootsRepository.list")(function* () {
  const { db } = yield* Database;

  return yield* Effect.tryPromise({
    try: () => db.select().from(libraryRoots).orderBy(asc(libraryRoots.label)),
    catch: (cause) =>
      new DatabaseError({
        cause,
        message: "Failed to load library roots",
      }),
  });
});
