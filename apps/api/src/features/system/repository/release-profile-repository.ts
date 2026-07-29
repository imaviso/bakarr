import { eq } from "drizzle-orm";
import { Context, Effect, Layer } from "effect";

import type { ReleaseProfileRule } from "@packages/shared/index.ts";
import { AppDrizzleDatabase, DatabaseError, type AppDatabase } from "@/db/database.ts";
import { releaseProfiles } from "@/db/schema.ts";
import { tryDatabase } from "@/infra/effect/db.ts";
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

export class ReleaseProfileRepository extends Context.Service<ReleaseProfileRepository>()(
  "@bakarr/api/ReleaseProfileRepository",
  {
    make: Effect.gen(function* () {
      const db = yield* AppDrizzleDatabase;
      return makeReleaseProfileRepositoryShape(db);
    }),
  },
) {
  static readonly layer = Layer.effect(
    ReleaseProfileRepository,
    ReleaseProfileRepository.make,
  ).pipe(Layer.provide([AppDrizzleDatabase.layer]));
}

export const listReleaseProfileRows = Effect.fn("ReleaseProfileRepository.listReleaseProfileRows")(
  function* (db: AppDatabase) {
    return yield* tryDatabase("Failed to list release profiles", () =>
      db.select().from(releaseProfiles).orderBy(releaseProfiles.id),
    );
  },
);

export const insertReleaseProfileRow = Effect.fn(
  "ReleaseProfileRepository.insertReleaseProfileRow",
)(function* (db: AppDatabase, row: typeof releaseProfiles.$inferInsert) {
  const rows = yield* tryDatabase("Failed to insert release profile", () =>
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
  yield* tryDatabase("Failed to update release profile", () =>
    db.update(releaseProfiles).set(row).where(eq(releaseProfiles.id, id)),
  );
});

export const deleteReleaseProfileRow = Effect.fn(
  "ReleaseProfileRepository.deleteReleaseProfileRow",
)(function* (db: AppDatabase, id: number) {
  yield* tryDatabase("Failed to delete release profile", () =>
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

  return decodedRules.flat();
});

export function makeReleaseProfileRepositoryShape(db: AppDatabase): ReleaseProfileRepositoryShape {
  return {
    deleteReleaseProfileRow: (id) => deleteReleaseProfileRow(db, id),
    insertReleaseProfileRow: (row) => insertReleaseProfileRow(db, row),
    listReleaseProfileRows: () => listReleaseProfileRows(db),
    loadReleaseRules: (mediaRow) => loadReleaseRules(db, mediaRow),
    updateReleaseProfileRow: (id, row) => updateReleaseProfileRow(db, id, row),
  } satisfies ReleaseProfileRepositoryShape;
}
