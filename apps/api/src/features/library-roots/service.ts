import { asc } from "drizzle-orm";
import { Context, Effect, Layer } from "effect";

import { Database, DatabaseError } from "../../db/database.ts";
import { libraryRoots, type LibraryRoot } from "../../db/schema.ts";
import { tryDatabasePromise } from "../../lib/effect-db.ts";

export type { LibraryRoot };

export interface LibraryRootsServiceShape {
  readonly listRoots: () => Effect.Effect<LibraryRoot[], DatabaseError>;
}

export class LibraryRootsService extends Context.Tag("@bakarr/api/LibraryRootsService")<
  LibraryRootsService,
  LibraryRootsServiceShape
>() {}

const makeLibraryRootsService = Effect.gen(function* () {
  const { db } = yield* Database;

  const listRoots = Effect.fn("LibraryRootsService.listRoots")(function* () {
    return yield* tryDatabasePromise("Failed to load library roots", () =>
      db.select().from(libraryRoots).orderBy(asc(libraryRoots.label)),
    );
  });

  return { listRoots } satisfies LibraryRootsServiceShape;
});

export const LibraryRootsServiceLive = Layer.effect(LibraryRootsService, makeLibraryRootsService);
