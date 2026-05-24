import { Effect } from "effect";
import { asc } from "drizzle-orm";

import { AppDrizzleDatabase, type AppDatabase } from "@/db/database.ts";
import { libraryRoots } from "@/db/schema.ts";
import { tryDatabasePromise } from "@/infra/effect/db.ts";

export interface LibraryRootsRepositoryShape {
  readonly listLibraryRoots: () => ReturnType<typeof listLibraryRoots>;
}

export class LibraryRootsRepository extends Effect.Service<LibraryRootsRepository>()(
  "@bakarr/api/LibraryRootsRepository",
  {
    effect: Effect.gen(function* () {
      const db = yield* AppDrizzleDatabase;
      return makeLibraryRootsRepositoryShape(db);
    }),
    dependencies: [AppDrizzleDatabase.Default],
  },
) {}

export const listLibraryRoots = Effect.fn("LibraryRootsRepository.listLibraryRoots")(function* (
  db: AppDatabase,
) {
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

function makeLibraryRootsRepositoryShape(db: AppDatabase): LibraryRootsRepositoryShape {
  return {
    listLibraryRoots: () => listLibraryRoots(db),
  } satisfies LibraryRootsRepositoryShape;
}
