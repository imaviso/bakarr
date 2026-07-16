import { eq } from "drizzle-orm";
import { Effect } from "effect";

import type { ReleaseProfileRule } from "@packages/shared/index.ts";
import { AppDrizzleDatabase, DatabaseError, type AppDatabase } from "@/db/database.ts";
import { releaseProfiles } from "@/db/schema.ts";
import { tryDatabasePromise } from "@/infra/effect/db.ts";
import { decodeNumberList, decodeReleaseProfileRules } from "@/features/system/profile-codec.ts";
import type { StoredConfigCorruptError } from "@/features/system/errors.ts";

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

export class ReleaseProfileRepository extends Effect.Service<ReleaseProfileRepository>()(
  "@bakarr/api/ReleaseProfileRepository",
  {
    effect: Effect.gen(function* () {
      const db = yield* AppDrizzleDatabase;
      return makeReleaseProfileRepositoryShape(db);
    }),
    dependencies: [AppDrizzleDatabase.Default],
  },
) {}

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

export const loadReleaseRules = Effect.fn("ReleaseProfileRepository.loadReleaseRules")(function* (
  db: AppDatabase,
  mediaRow: { releaseProfileIds: string },
) {
  const assignedIds = yield* decodeNumberList(mediaRow.releaseProfileIds);
  const rows = yield* listReleaseProfileRows(db);
  const decodedRules = yield* Effect.forEach(
    rows.filter((row) => row.enabled && (row.isGlobal || assignedIds.includes(row.id))),
    (row) => decodeReleaseProfileRules(row.rules),
  );

  return decodedRules.flat() as readonly ReleaseProfileRule[];
});

function makeReleaseProfileRepositoryShape(db: AppDatabase): ReleaseProfileRepositoryShape {
  return {
    deleteReleaseProfileRow: (id) => deleteReleaseProfileRow(db, id),
    insertReleaseProfileRow: (row) => insertReleaseProfileRow(db, row),
    listReleaseProfileRows: () => listReleaseProfileRows(db),
    loadReleaseRules: (mediaRow) => loadReleaseRules(db, mediaRow),
    updateReleaseProfileRow: (id, row) => updateReleaseProfileRow(db, id, row),
  } satisfies ReleaseProfileRepositoryShape;
}

export function makeReleaseProfileRepository(db: AppDatabase): ReleaseProfileRepository {
  return ReleaseProfileRepository.make(makeReleaseProfileRepositoryShape(db));
}
