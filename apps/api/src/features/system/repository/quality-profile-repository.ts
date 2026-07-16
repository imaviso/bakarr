import { count, eq } from "drizzle-orm";
import { Effect, Option } from "effect";

import type { QualityProfile } from "@packages/shared/index.ts";
import { AppDrizzleDatabase, type AppDatabase, type DatabaseError } from "@/db/database.ts";
import { media, qualityProfiles } from "@/db/schema.ts";
import { tryDatabasePromise } from "@/infra/effect/db.ts";
import { decodeQualityProfileRow } from "@/features/system/profile-codec.ts";
import type { StoredConfigCorruptError } from "@/features/system/errors.ts";

export interface QualityProfileRepositoryShape {
  readonly deleteQualityProfileRow: (name: string) => Effect.Effect<void, DatabaseError>;
  readonly countMediaUsingProfile: (profileName: string) => Effect.Effect<number, DatabaseError>;
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
  readonly loadQualityProfile: (
    name: string,
  ) => Effect.Effect<Option.Option<QualityProfile>, DatabaseError | StoredConfigCorruptError>;
  readonly loadQualityProfileRow: (
    name: string,
  ) => Effect.Effect<typeof qualityProfiles.$inferSelect | undefined, DatabaseError>;
  readonly qualityProfileExists: (name: string) => Effect.Effect<boolean, DatabaseError>;
  readonly renameQualityProfileWithCascade: (
    oldName: string,
    row: typeof qualityProfiles.$inferInsert,
  ) => Effect.Effect<void, DatabaseError>;
  readonly updateQualityProfileRow: (
    name: string,
    row: typeof qualityProfiles.$inferInsert,
  ) => Effect.Effect<void, DatabaseError>;
}

export class QualityProfileRepository extends Effect.Service<QualityProfileRepository>()(
  "@bakarr/api/QualityProfileRepository",
  {
    effect: Effect.gen(function* () {
      const db = yield* AppDrizzleDatabase;
      return makeQualityProfileRepositoryShape(db);
    }),
    dependencies: [AppDrizzleDatabase.Default],
  },
) {}

export const loadAnyQualityProfileRow = Effect.fn(
  "QualityProfileRepository.loadAnyQualityProfileRow",
)(function* (db: AppDatabase) {
  const rows = yield* tryDatabasePromise("Failed to load quality profile", () =>
    db.select().from(qualityProfiles).limit(1),
  );

  return rows[0];
});

export const countMediaUsingProfile = Effect.fn("QualityProfileRepository.countMediaUsingProfile")(
  function* (db: AppDatabase, profileName: string) {
    const rows = yield* tryDatabasePromise("Failed to count media", () =>
      db.select({ value: count() }).from(media).where(eq(media.profileName, profileName)),
    );
    return rows[0]?.value ?? 0;
  },
);

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

export const loadQualityProfile = Effect.fn("QualityProfileRepository.loadQualityProfile")(
  function* (db: AppDatabase, name: string) {
    const row = yield* loadQualityProfileRow(db, name);
    if (!row) {
      return Option.none<QualityProfile>();
    }

    return yield* decodeQualityProfileRow(row).pipe(Effect.map((profile) => Option.some(profile)));
  },
);

export const qualityProfileExists = Effect.fn("QualityProfileRepository.qualityProfileExists")(
  function* (db: AppDatabase, name: string) {
    const rows = yield* tryDatabasePromise("Failed to verify quality profile", () =>
      db
        .select({ name: qualityProfiles.name })
        .from(qualityProfiles)
        .where(eq(qualityProfiles.name, name))
        .limit(1),
    );
    return rows.length > 0;
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
        await tx.update(media).set({ profileName: row.name }).where(eq(media.profileName, oldName));
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

function makeQualityProfileRepositoryShape(db: AppDatabase): QualityProfileRepositoryShape {
  return {
    countMediaUsingProfile: (profileName) => countMediaUsingProfile(db, profileName),
    deleteQualityProfileRow: (name) => deleteQualityProfileRow(db, name),
    insertQualityProfileRow: (row) => insertQualityProfileRow(db, row),
    insertQualityProfileRows: (rows) => insertQualityProfileRows(db, rows),
    listQualityProfileRows: () => listQualityProfileRows(db),
    loadAnyQualityProfileRow: () => loadAnyQualityProfileRow(db),
    loadQualityProfile: (name) => loadQualityProfile(db, name),
    loadQualityProfileRow: (name) => loadQualityProfileRow(db, name),
    qualityProfileExists: (name) => qualityProfileExists(db, name),
    renameQualityProfileWithCascade: (oldName, row) =>
      renameQualityProfileWithCascade(db, oldName, row),
    updateQualityProfileRow: (name, row) => updateQualityProfileRow(db, name, row),
  } satisfies QualityProfileRepositoryShape;
}

export function makeQualityProfileRepository(db: AppDatabase): QualityProfileRepository {
  return QualityProfileRepository.make(makeQualityProfileRepositoryShape(db));
}
