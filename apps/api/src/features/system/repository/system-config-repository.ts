import { eq } from "drizzle-orm";
import { Effect, Option } from "effect";

import { Database, type AppDatabase, type DatabaseError } from "@/db/database.ts";
import { appConfig, qualityProfiles } from "@/db/schema.ts";
import { queryFirst, tryDatabasePromise } from "@/infra/effect/db.ts";

export interface SystemConfigRepositoryShape {
  readonly loadSystemConfigRow: () => Effect.Effect<
    typeof appConfig.$inferSelect | undefined,
    DatabaseError
  >;
  readonly insertSystemConfigRow: (
    input: typeof appConfig.$inferInsert,
  ) => Effect.Effect<void, DatabaseError>;
  readonly upsertSystemConfigRow: (
    input: typeof appConfig.$inferInsert,
  ) => Effect.Effect<void, DatabaseError>;
  readonly updateSystemConfigAtomic: (
    coreInput: typeof appConfig.$inferInsert,
    profileRows: readonly (typeof qualityProfiles.$inferInsert)[],
  ) => Effect.Effect<void, DatabaseError>;
  readonly ensureBootstrapSystemState: (
    coreInput: typeof appConfig.$inferInsert,
    profileRows: readonly (typeof qualityProfiles.$inferInsert)[],
  ) => Effect.Effect<void, DatabaseError>;
}

export class SystemConfigRepository extends Effect.Service<SystemConfigRepository>()(
  "@bakarr/api/SystemConfigRepository",
  {
    effect: Effect.gen(function* () {
      const { db } = yield* Database;
      return makeSystemConfigRepositoryShape(db);
    }),
  },
) {}

export const loadSystemConfigRow = Effect.fn("SystemConfigRepository.loadSystemConfigRow")(
  function* (db: AppDatabase) {
    const row = yield* queryFirst("Failed to load system config", () =>
      db.select().from(appConfig).where(eq(appConfig.id, 1)).limit(1),
    );

    return Option.getOrUndefined(row);
  },
);

export const insertSystemConfigRow = Effect.fn("SystemConfigRepository.insertSystemConfigRow")(
  function* (db: AppDatabase, input: typeof appConfig.$inferInsert) {
    yield* tryDatabasePromise("Failed to insert system config", () =>
      db.insert(appConfig).values(input),
    );
  },
);

export const upsertSystemConfigRow = Effect.fn("SystemConfigRepository.upsertSystemConfigRow")(
  function* (db: AppDatabase, input: typeof appConfig.$inferInsert) {
    yield* tryDatabasePromise("Failed to upsert system config", () =>
      db
        .insert(appConfig)
        .values(input)
        .onConflictDoUpdate({
          target: appConfig.id,
          set: { data: input.data, updatedAt: input.updatedAt },
        }),
    );
  },
);

export const updateSystemConfigAtomic = Effect.fn(
  "SystemConfigRepository.updateSystemConfigAtomic",
)(function* (
  db: AppDatabase,
  coreInput: typeof appConfig.$inferInsert,
  profileRows: readonly (typeof qualityProfiles.$inferInsert)[],
) {
  yield* tryDatabasePromise("Failed to update system config", () =>
    db.transaction(async (tx) => {
      await tx
        .insert(appConfig)
        .values(coreInput)
        .onConflictDoUpdate({
          target: appConfig.id,
          set: { data: coreInput.data, updatedAt: coreInput.updatedAt },
        });

      await tx.delete(qualityProfiles);

      if (profileRows.length > 0) {
        await tx.insert(qualityProfiles).values([...profileRows]);
      }
    }),
  );
});

export const ensureBootstrapSystemState = Effect.fn(
  "SystemConfigRepository.ensureBootstrapSystemState",
)(function* (
  db: AppDatabase,
  coreInput: typeof appConfig.$inferInsert,
  profileRows: readonly (typeof qualityProfiles.$inferInsert)[],
) {
  yield* tryDatabasePromise("Failed to ensure bootstrap system state", () =>
    db.transaction(async (tx) => {
      const configRows = await tx.select().from(appConfig).where(eq(appConfig.id, 1)).limit(1);

      if (configRows.length === 0) {
        await tx.insert(appConfig).values(coreInput);
      }

      const existingProfiles = await tx.select().from(qualityProfiles).limit(1);

      if (existingProfiles.length === 0) {
        await tx.insert(qualityProfiles).values([...profileRows]);
      }
    }),
  );
});

function makeSystemConfigRepositoryShape(db: AppDatabase): SystemConfigRepositoryShape {
  return {
    ensureBootstrapSystemState: (coreInput, profileRows) =>
      ensureBootstrapSystemState(db, coreInput, profileRows),
    insertSystemConfigRow: (input) => insertSystemConfigRow(db, input),
    loadSystemConfigRow: () => loadSystemConfigRow(db),
    updateSystemConfigAtomic: (coreInput, profileRows) =>
      updateSystemConfigAtomic(db, coreInput, profileRows),
    upsertSystemConfigRow: (input) => upsertSystemConfigRow(db, input),
  } satisfies SystemConfigRepositoryShape;
}

export function makeSystemConfigRepository(db: AppDatabase): SystemConfigRepository {
  return SystemConfigRepository.make(makeSystemConfigRepositoryShape(db));
}
