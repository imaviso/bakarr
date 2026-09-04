// oxlint-disable oxc/no-async-await -- async/await required by transaction callbacks, test callbacks, and tryPromise wrappers
import { count, eq } from "drizzle-orm";
import * as NodeSqliteClient from "@effect/sql-sqlite-node/SqliteClient";

import type { QualityProfile } from "@packages/shared/index.ts";
import { AppDrizzleDatabase, type AppDatabase, type DatabaseError } from "@/db/database.ts";
import { media, qualityProfiles } from "@/db/schema.ts";
import { makeDbExecutor, type DbExecutor } from "@/infra/effect/db.ts";
import { decodeQualityProfileRow } from "@/features/system/profile-codec.ts";
import type { StoredConfigCorruptError } from "@/features/system/errors.ts";
import { Context, Effect, Layer, Option } from "effect";

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

export class QualityProfileRepository extends Context.Service<
  QualityProfileRepository,
  QualityProfileRepositoryShape
>()("@bakarr/api/QualityProfileRepository") {
  static readonly layer = Layer.effect(
    QualityProfileRepository,
    Effect.gen(function* () {
      const db = yield* AppDrizzleDatabase;
      const sqlClient = yield* NodeSqliteClient.SqliteClient;
      return makeQualityProfileRepositoryShape(db, sqlClient);
    }),
  );
}

export const loadAnyQualityProfileRow = Effect.fn(
  "QualityProfileRepository.loadAnyQualityProfileRow",
)(function* (db: AppDatabase, exec: DbExecutor) {
  const rows = yield* exec.runQuery(
    "Failed to load quality profile",
    db.select().from(qualityProfiles).limit(1).prepare().effect(),
  );

  return rows[0];
});

export const countMediaUsingProfile = Effect.fn("QualityProfileRepository.countMediaUsingProfile")(
  function* (db: AppDatabase, exec: DbExecutor, profileName: string) {
    const rows = yield* exec.runQuery(
      "Failed to count media",
      db
        .select({ value: count() })
        .from(media)
        .where(eq(media.profileName, profileName))
        .prepare()
        .effect(),
    );
    return rows[0]?.value ?? 0;
  },
);

export const listQualityProfileRows = Effect.fn("QualityProfileRepository.listQualityProfileRows")(
  function* (db: AppDatabase, exec: DbExecutor) {
    return yield* exec.runQuery(
      "Failed to list quality profiles",
      db.select().from(qualityProfiles).orderBy(qualityProfiles.name).prepare().effect(),
    );
  },
);

export const insertQualityProfileRow = Effect.fn(
  "QualityProfileRepository.insertQualityProfileRow",
)(function* (db: AppDatabase, exec: DbExecutor, row: typeof qualityProfiles.$inferInsert) {
  yield* exec.runQuery(
    "Failed to insert quality profile",
    db.insert(qualityProfiles).values(row).prepare().effect(),
  );
});

export const insertQualityProfileRows = Effect.fn(
  "QualityProfileRepository.insertQualityProfileRows",
)(function* (
  db: AppDatabase,
  exec: DbExecutor,
  rows: readonly (typeof qualityProfiles.$inferInsert)[],
) {
  if (rows.length === 0) {
    return;
  }

  yield* exec.runQuery(
    "Failed to insert quality profiles",
    db
      .insert(qualityProfiles)
      .values([...rows])
      .prepare()
      .effect(),
  );
});

export const loadQualityProfileRow = Effect.fn("QualityProfileRepository.loadQualityProfileRow")(
  function* (db: AppDatabase, exec: DbExecutor, name: string) {
    const rows = yield* exec.runQuery(
      "Failed to load quality profile",
      db
        .select()
        .from(qualityProfiles)
        .where(eq(qualityProfiles.name, name))
        .limit(1)
        .prepare()
        .effect(),
    );

    return rows[0];
  },
);

export const loadQualityProfile = Effect.fn("QualityProfileRepository.loadQualityProfile")(
  function* (db: AppDatabase, exec: DbExecutor, name: string) {
    const row = yield* loadQualityProfileRow(db, exec, name);
    if (!row) {
      return Option.none<QualityProfile>();
    }

    return yield* decodeQualityProfileRow(row).pipe(Effect.map((profile) => Option.some(profile)));
  },
);

export const qualityProfileExists = Effect.fn("QualityProfileRepository.qualityProfileExists")(
  function* (db: AppDatabase, exec: DbExecutor, name: string) {
    const rows = yield* exec.runQuery(
      "Failed to verify quality profile",
      db
        .select({ name: qualityProfiles.name })
        .from(qualityProfiles)
        .where(eq(qualityProfiles.name, name))
        .limit(1)
        .prepare()
        .effect(),
    );
    return rows.length > 0;
  },
);

export const updateQualityProfileRow = Effect.fn(
  "QualityProfileRepository.updateQualityProfileRow",
)(function* (
  db: AppDatabase,
  exec: DbExecutor,
  name: string,
  row: typeof qualityProfiles.$inferInsert,
) {
  yield* exec.runQuery(
    "Failed to update quality profile",
    db.update(qualityProfiles).set(row).where(eq(qualityProfiles.name, name)).prepare().effect(),
  );
});

export const renameQualityProfileWithCascade = Effect.fn(
  "QualityProfileRepository.renameQualityProfileWithCascade",
)(function* (
  db: AppDatabase,
  exec: DbExecutor,
  oldName: string,
  row: typeof qualityProfiles.$inferInsert,
) {
  yield* exec.runTransaction(
    "Failed to rename quality profile",
    Effect.gen(function* () {
      yield* db
        .update(qualityProfiles)
        .set(row)
        .where(eq(qualityProfiles.name, oldName))
        .prepare()
        .effect();

      if (oldName !== row.name) {
        yield* db
          .update(media)
          .set({ profileName: row.name })
          .where(eq(media.profileName, oldName))
          .prepare()
          .effect();
      }
    }),
  );
});

export const deleteQualityProfileRow = Effect.fn(
  "QualityProfileRepository.deleteQualityProfileRow",
)(function* (db: AppDatabase, exec: DbExecutor, name: string) {
  yield* exec.runQuery(
    "Failed to delete quality profile",
    db.delete(qualityProfiles).where(eq(qualityProfiles.name, name)).prepare().effect(),
  );
});

export function makeQualityProfileRepositoryShape(
  db: AppDatabase,
  sqlClient: NodeSqliteClient.SqliteClient,
): QualityProfileRepositoryShape {
  const exec = makeDbExecutor(sqlClient);
  return {
    countMediaUsingProfile: (profileName) => countMediaUsingProfile(db, exec, profileName),
    deleteQualityProfileRow: (name) => deleteQualityProfileRow(db, exec, name),
    insertQualityProfileRow: (row) => insertQualityProfileRow(db, exec, row),
    insertQualityProfileRows: (rows) => insertQualityProfileRows(db, exec, rows),
    listQualityProfileRows: () => listQualityProfileRows(db, exec),
    loadAnyQualityProfileRow: () => loadAnyQualityProfileRow(db, exec),
    loadQualityProfile: (name) => loadQualityProfile(db, exec, name),
    loadQualityProfileRow: (name) => loadQualityProfileRow(db, exec, name),
    qualityProfileExists: (name) => qualityProfileExists(db, exec, name),
    renameQualityProfileWithCascade: (oldName, row) =>
      renameQualityProfileWithCascade(db, exec, oldName, row),
    updateQualityProfileRow: (name, row) => updateQualityProfileRow(db, exec, name, row),
  } satisfies QualityProfileRepositoryShape;
}
