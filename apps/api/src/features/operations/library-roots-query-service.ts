import { asc } from "drizzle-orm";
import { Context, Effect, Layer } from "effect";

import { Database, DatabaseError } from "@/db/database.ts";
import { libraryRoots } from "@/db/schema.ts";
import { tryDatabasePromise } from "@/infra/effect/db.ts";

export interface LibraryRoot {
  readonly id: number;
  readonly label: string;
  readonly path: string;
}

export interface LibraryRootsQueryServiceShape {
  readonly listRoots: () => Effect.Effect<LibraryRoot[], DatabaseError>;
}

export class LibraryRootsQueryService extends Context.Tag("@bakarr/api/LibraryRootsQueryService")<
  LibraryRootsQueryService,
  LibraryRootsQueryServiceShape
>() {}

const makeLibraryRootsQueryService = Effect.gen(function* () {
  const { db } = yield* Database;

  const listRoots = Effect.fn("LibraryRootsQueryService.listRoots")(function* () {
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

  return { listRoots } satisfies LibraryRootsQueryServiceShape;
});

export const LibraryRootsQueryServiceLive = Layer.effect(
  LibraryRootsQueryService,
  makeLibraryRootsQueryService,
);
