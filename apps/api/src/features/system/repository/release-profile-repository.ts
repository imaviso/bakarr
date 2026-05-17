import { eq } from "drizzle-orm";
import { Effect } from "effect";

import { DatabaseError, type AppDatabase } from "@/db/database.ts";
import { releaseProfiles } from "@/db/schema.ts";
import { tryDatabasePromise } from "@/infra/effect/db.ts";

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
