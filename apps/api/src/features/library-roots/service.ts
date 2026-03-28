import { asc } from "drizzle-orm";
import { Context, Effect, Layer } from "effect";

import { Database, DatabaseError } from "../../db/database.ts";
import { libraryRoots } from "../../db/schema.ts";
import { tryDatabasePromise } from "../../lib/effect-db.ts";

export interface LibraryRoot {
  readonly id: number;
  readonly label: string;
  readonly path: string;
}

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
    const rows = yield* tryDatabasePromise("Failed to load library roots", () =>
      db
        .select({
          id: libraryRoots.id,
          label: libraryRoots.label,
          path: libraryRoots.path,
        })
        .from(libraryRoots)
        .orderBy(asc(libraryRoots.label)),
    );

    return rows.map((row) => ({
      id: row.id,
      label: row.label,
      path: row.path,
    }));
  });

  return { listRoots } satisfies LibraryRootsServiceShape;
});

export const LibraryRootsServiceLive = Layer.effect(LibraryRootsService, makeLibraryRootsService);
