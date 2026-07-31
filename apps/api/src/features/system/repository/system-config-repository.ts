import { eq } from "drizzle-orm";
import { Effect, Option } from "effect";

import { AppDrizzleDatabase, type AppDatabase, type DatabaseError } from "@/db/database.ts";
import { appConfig, qualityProfiles } from "@/db/schema.ts";
import { queryFirst, tryDatabasePromise } from "@/infra/effect/db.ts";

export interface SystemConfigRepositoryShape {
  readonly loadSystemConfigRow: () => Effect.Effect<
    typeof appConfig.$inferSelect | undefined,
    DatabaseError
  >;
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
      const db = yield* AppDrizzleDatabase;
      return makeSystemConfigRepositoryShape(db);
    }),
    dependencies: [AppDrizzleDatabase.Default],
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

export function makeSystemConfigRepositoryShape(db: AppDatabase): SystemConfigRepositoryShape {
  return {
    ensureBootstrapSystemState: (coreInput, profileRows) =>
      ensureBootstrapSystemState(db, coreInput, profileRows),
    loadSystemConfigRow: () => loadSystemConfigRow(db),
    updateSystemConfigAtomic: (coreInput, profileRows) =>
      updateSystemConfigAtomic(db, coreInput, profileRows),
  } satisfies SystemConfigRepositoryShape;
}
