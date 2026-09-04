import { eq } from "drizzle-orm";
import * as NodeSqliteClient from "@effect/sql-sqlite-node/SqliteClient";

import type { ReleaseProfileRule } from "@packages/shared/index.ts";
import { AppDrizzleDatabase, DatabaseError, type AppDatabase } from "@/db/database.ts";
import { releaseProfiles } from "@/db/schema.ts";
import { makeDbExecutor, type DbExecutor } from "@/infra/effect/db.ts";
import { decodeNumberList, decodeReleaseProfileRules } from "@/features/system/profile-codec.ts";
import type { StoredConfigCorruptError } from "@/features/system/errors.ts";
import { Context, Effect, Layer } from "effect";

export interface ReleaseProfileRepositoryShape {
  readonly deleteReleaseProfileRow: (id: number) => ReturnType<typeof deleteReleaseProfileRow>;
  readonly insertReleaseProfileRow: (
    row: typeof releaseProfiles.$inferInsert,
  ) => ReturnType<typeof insertReleaseProfileRow>;
  readonly listReleaseProfileRows: () => ReturnType<typeof listReleaseProfileRows>;
  readonly loadReleaseRules: (mediaRow: {
    releaseProfileIds: string;
  }) => Effect.Effect<readonly ReleaseProfileRule[], DatabaseError | StoredConfigCorruptError>;
  readonly updateReleaseProfileRow: (
    id: number,
    row: Partial<typeof releaseProfiles.$inferInsert>,
  ) => ReturnType<typeof updateReleaseProfileRow>;
}

export class ReleaseProfileRepository extends Context.Service<
  ReleaseProfileRepository,
  ReleaseProfileRepositoryShape
>()("@bakarr/api/ReleaseProfileRepository") {
  static readonly layer = Layer.effect(
    ReleaseProfileRepository,
    Effect.gen(function* () {
      const db = yield* AppDrizzleDatabase;
      const sqlClient = yield* NodeSqliteClient.SqliteClient;
      return makeReleaseProfileRepositoryShape(db, sqlClient);
    }),
  );
}

export const listReleaseProfileRows = Effect.fn("ReleaseProfileRepository.listReleaseProfileRows")(
  function* (db: AppDatabase, exec: DbExecutor) {
    return yield* exec.runQuery(
      "Failed to list release profiles",
      db.select().from(releaseProfiles).orderBy(releaseProfiles.id).prepare().effect(),
    );
  },
);

export const insertReleaseProfileRow = Effect.fn(
  "ReleaseProfileRepository.insertReleaseProfileRow",
)(function* (db: AppDatabase, exec: DbExecutor, row: typeof releaseProfiles.$inferInsert) {
  const rows = yield* exec.runQuery(
    "Failed to insert release profile",
    db.insert(releaseProfiles).values(row).returning().prepare().effect(),
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
)(function* (
  db: AppDatabase,
  exec: DbExecutor,
  id: number,
  row: Partial<typeof releaseProfiles.$inferInsert>,
) {
  yield* exec.runQuery(
    "Failed to update release profile",
    db.update(releaseProfiles).set(row).where(eq(releaseProfiles.id, id)).prepare().effect(),
  );
});

export const deleteReleaseProfileRow = Effect.fn(
  "ReleaseProfileRepository.deleteReleaseProfileRow",
)(function* (db: AppDatabase, exec: DbExecutor, id: number) {
  yield* exec.runQuery(
    "Failed to delete release profile",
    db.delete(releaseProfiles).where(eq(releaseProfiles.id, id)).prepare().effect(),
  );
});

export const loadReleaseRules = Effect.fn("ReleaseProfileRepository.loadReleaseRules")(function* (
  db: AppDatabase,
  exec: DbExecutor,
  mediaRow: { releaseProfileIds: string },
) {
  const assignedIds = yield* decodeNumberList(mediaRow.releaseProfileIds);
  const rows = yield* listReleaseProfileRows(db, exec);
  const decodedRules = yield* Effect.forEach(
    rows.filter((row) => row.enabled && (row.isGlobal || assignedIds.includes(row.id))),
    (row) => decodeReleaseProfileRules(row.rules),
  );

  return decodedRules.flat();
});

export function makeReleaseProfileRepositoryShape(
  db: AppDatabase,
  sqlClient: NodeSqliteClient.SqliteClient,
): ReleaseProfileRepositoryShape {
  const exec = makeDbExecutor(sqlClient);
  return {
    deleteReleaseProfileRow: (id) => deleteReleaseProfileRow(db, exec, id),
    insertReleaseProfileRow: (row) => insertReleaseProfileRow(db, exec, row),
    listReleaseProfileRows: () => listReleaseProfileRows(db, exec),
    loadReleaseRules: (mediaRow) => loadReleaseRules(db, exec, mediaRow),
    updateReleaseProfileRow: (id, row) => updateReleaseProfileRow(db, exec, id, row),
  } satisfies ReleaseProfileRepositoryShape;
}
