import { eq } from "drizzle-orm";
import { Context, Effect, Layer } from "effect";

import { Database, type AppDatabase, type DatabaseError } from "@/db/database.ts";
import { anime, qualityProfiles } from "@/db/schema.ts";
import { tryDatabasePromise } from "@/infra/effect/db.ts";

export interface QualityProfileRepositoryShape {
  readonly deleteQualityProfileRow: (name: string) => Effect.Effect<void, DatabaseError>;
  readonly insertQualityProfileRow: (
    row: typeof qualityProfiles.$inferInsert,
  ) => Effect.Effect<void, DatabaseError>;
  readonly insertQualityProfileRows: (
    rows: readonly (typeof qualityProfiles.$inferInsert)[],
  ) => Effect.Effect<void, DatabaseError>;
  readonly listQualityProfileRows: () => Effect.Effect<
    readonly (typeof qualityProfiles.$inferSelect)[],
    DatabaseError
  >;
  readonly loadAnyQualityProfileRow: () => Effect.Effect<
    typeof qualityProfiles.$inferSelect | undefined,
    DatabaseError
  >;
  readonly loadQualityProfileRow: (
    name: string,
  ) => Effect.Effect<typeof qualityProfiles.$inferSelect | undefined, DatabaseError>;
  readonly renameQualityProfileWithCascade: (
    oldName: string,
    row: typeof qualityProfiles.$inferInsert,
  ) => Effect.Effect<void, DatabaseError>;
  readonly updateQualityProfileRow: (
    name: string,
    row: typeof qualityProfiles.$inferInsert,
  ) => Effect.Effect<void, DatabaseError>;
}

export class QualityProfileRepository extends Context.Tag("@bakarr/api/QualityProfileRepository")<
  QualityProfileRepository,
  QualityProfileRepositoryShape
>() {}

export const loadAnyQualityProfileRow = Effect.fn(
  "QualityProfileRepository.loadAnyQualityProfileRow",
)(function* (db: AppDatabase) {
  const rows = yield* tryDatabasePromise("Failed to load quality profile", () =>
    db.select().from(qualityProfiles).limit(1),
  );

  return rows[0];
});

export const listQualityProfileRows = Effect.fn("QualityProfileRepository.listQualityProfileRows")(
  function* (db: AppDatabase) {
    return yield* tryDatabasePromise("Failed to list quality profiles", () =>
      db.select().from(qualityProfiles).orderBy(qualityProfiles.name),
    );
  },
);

export const insertQualityProfileRow = Effect.fn(
  "QualityProfileRepository.insertQualityProfileRow",
)(function* (db: AppDatabase, row: typeof qualityProfiles.$inferInsert) {
  yield* tryDatabasePromise("Failed to insert quality profile", () =>
    db.insert(qualityProfiles).values(row),
  );
});

export const insertQualityProfileRows = Effect.fn(
  "QualityProfileRepository.insertQualityProfileRows",
)(function* (db: AppDatabase, rows: readonly (typeof qualityProfiles.$inferInsert)[]) {
  if (rows.length === 0) {
    return;
  }

  yield* tryDatabasePromise("Failed to insert quality profiles", () =>
    db.insert(qualityProfiles).values([...rows]),
  );
});

export const loadQualityProfileRow = Effect.fn("QualityProfileRepository.loadQualityProfileRow")(
  function* (db: AppDatabase, name: string) {
    const rows = yield* tryDatabasePromise("Failed to load quality profile", () =>
      db.select().from(qualityProfiles).where(eq(qualityProfiles.name, name)).limit(1),
    );

    return rows[0];
  },
);

export const updateQualityProfileRow = Effect.fn(
  "QualityProfileRepository.updateQualityProfileRow",
)(function* (db: AppDatabase, name: string, row: typeof qualityProfiles.$inferInsert) {
  yield* tryDatabasePromise("Failed to update quality profile", () =>
    db.update(qualityProfiles).set(row).where(eq(qualityProfiles.name, name)),
  );
});

export const renameQualityProfileWithCascade = Effect.fn(
  "QualityProfileRepository.renameQualityProfileWithCascade",
)(function* (db: AppDatabase, oldName: string, row: typeof qualityProfiles.$inferInsert) {
  yield* tryDatabasePromise("Failed to rename quality profile", () =>
    db.transaction(async (tx) => {
      await tx.update(qualityProfiles).set(row).where(eq(qualityProfiles.name, oldName));

      if (oldName !== row.name) {
        await tx.update(anime).set({ profileName: row.name }).where(eq(anime.profileName, oldName));
      }
    }),
  );
});

export const deleteQualityProfileRow = Effect.fn(
  "QualityProfileRepository.deleteQualityProfileRow",
)(function* (db: AppDatabase, name: string) {
  yield* tryDatabasePromise("Failed to delete quality profile", () =>
    db.delete(qualityProfiles).where(eq(qualityProfiles.name, name)),
  );
});

export function makeQualityProfileRepository(db: AppDatabase): QualityProfileRepositoryShape {
  return QualityProfileRepository.of({
    deleteQualityProfileRow: (name) => deleteQualityProfileRow(db, name),
    insertQualityProfileRow: (row) => insertQualityProfileRow(db, row),
    insertQualityProfileRows: (rows) => insertQualityProfileRows(db, rows),
    listQualityProfileRows: () => listQualityProfileRows(db),
    loadAnyQualityProfileRow: () => loadAnyQualityProfileRow(db),
    loadQualityProfileRow: (name) => loadQualityProfileRow(db, name),
    renameQualityProfileWithCascade: (oldName, row) =>
      renameQualityProfileWithCascade(db, oldName, row),
    updateQualityProfileRow: (name, row) => updateQualityProfileRow(db, name, row),
  });
}

export const QualityProfileRepositoryLive = Layer.effect(
  QualityProfileRepository,
  Effect.gen(function* () {
    const { db } = yield* Database;
    return makeQualityProfileRepository(db);
  }),
);
