import { eq } from "drizzle-orm";
import { Context, Effect, Layer } from "effect";

import { Database, DatabaseError, type AppDatabase } from "@/db/database.ts";
import { releaseProfiles } from "@/db/schema.ts";
import { tryDatabasePromise } from "@/infra/effect/db.ts";

export interface ReleaseProfileRepositoryShape {
  readonly deleteReleaseProfileRow: (id: number) => ReturnType<typeof deleteReleaseProfileRow>;
  readonly insertReleaseProfileRow: (
    row: typeof releaseProfiles.$inferInsert,
  ) => ReturnType<typeof insertReleaseProfileRow>;
  readonly listReleaseProfileRows: () => ReturnType<typeof listReleaseProfileRows>;
  readonly updateReleaseProfileRow: (
    id: number,
    row: Partial<typeof releaseProfiles.$inferInsert>,
  ) => ReturnType<typeof updateReleaseProfileRow>;
}

export class ReleaseProfileRepository extends Context.Tag("@bakarr/api/ReleaseProfileRepository")<
  ReleaseProfileRepository,
  ReleaseProfileRepositoryShape
>() {}

export const listReleaseProfileRows = Effect.fn("ReleaseProfileRepository.listReleaseProfileRows")(
  function* (db: AppDatabase) {
    return yield* tryDatabasePromise("Failed to list release profiles", () =>
      db.select().from(releaseProfiles).orderBy(releaseProfiles.id),
    );
  },
);

export const insertReleaseProfileRow = Effect.fn(
  "ReleaseProfileRepository.insertReleaseProfileRow",
)(function* (db: AppDatabase, row: typeof releaseProfiles.$inferInsert) {
  const rows = yield* tryDatabasePromise("Failed to insert release profile", () =>
    db.insert(releaseProfiles).values(row).returning(),
  );

  const inserted = rows[0];

  if (!inserted) {
    return yield* new DatabaseError({
      cause: new Error("Release profile insert returned no rows"),
      message: "Failed to insert release profile",
    });
  }

  return inserted;
});

export const updateReleaseProfileRow = Effect.fn(
  "ReleaseProfileRepository.updateReleaseProfileRow",
)(function* (db: AppDatabase, id: number, row: Partial<typeof releaseProfiles.$inferInsert>) {
  yield* tryDatabasePromise("Failed to update release profile", () =>
    db.update(releaseProfiles).set(row).where(eq(releaseProfiles.id, id)),
  );
});

export const deleteReleaseProfileRow = Effect.fn(
  "ReleaseProfileRepository.deleteReleaseProfileRow",
)(function* (db: AppDatabase, id: number) {
  yield* tryDatabasePromise("Failed to delete release profile", () =>
    db.delete(releaseProfiles).where(eq(releaseProfiles.id, id)),
  );
});

export function makeReleaseProfileRepository(db: AppDatabase): ReleaseProfileRepositoryShape {
  return ReleaseProfileRepository.of({
    deleteReleaseProfileRow: (id) => deleteReleaseProfileRow(db, id),
    insertReleaseProfileRow: (row) => insertReleaseProfileRow(db, row),
    listReleaseProfileRows: () => listReleaseProfileRows(db),
    updateReleaseProfileRow: (id, row) => updateReleaseProfileRow(db, id, row),
  });
}

export const ReleaseProfileRepositoryLive = Layer.effect(
  ReleaseProfileRepository,
  Effect.gen(function* () {
    const { db } = yield* Database;
    return makeReleaseProfileRepository(db);
  }),
);
