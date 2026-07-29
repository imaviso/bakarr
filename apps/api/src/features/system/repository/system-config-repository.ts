import { eq } from "drizzle-orm";
import { Context, Effect, Layer, Option } from "effect";

import { AppDrizzleDatabase, type AppDatabase, type DatabaseError } from "@/db/database.ts";
import { appConfig, qualityProfiles } from "@/db/schema.ts";
import { queryFirst, tryDatabase } from "@/infra/effect/db.ts";

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

export class SystemConfigRepository extends Context.Service<SystemConfigRepository>()(
  "@bakarr/api/SystemConfigRepository",
  {
    make: Effect.gen(function* () {
      const db = yield* AppDrizzleDatabase;
      return makeSystemConfigRepositoryShape(db);
    }),
  },
) {
  static readonly layerWithoutDependencies = Layer.effect(
    SystemConfigRepository,
    SystemConfigRepository.make,
  );
  static readonly layer = SystemConfigRepository.layerWithoutDependencies.pipe(
    Layer.provide([AppDrizzleDatabase.layer]),
  );
}

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
    yield* tryDatabase("Failed to insert system config", () => db.insert(appConfig).values(input));
  },
);

export const upsertSystemConfigRow = Effect.fn("SystemConfigRepository.upsertSystemConfigRow")(
  function* (db: AppDatabase, input: typeof appConfig.$inferInsert) {
    yield* tryDatabase("Failed to upsert system config", () =>
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
  yield* tryDatabase("Failed to update system config", () =>
    db.transaction((tx) =>
      Effect.gen(function* () {
        yield* tx
          .insert(appConfig)
          .values(coreInput)
          .onConflictDoUpdate({
            target: appConfig.id,
            set: { data: coreInput.data, updatedAt: coreInput.updatedAt },
          });

        yield* tx.delete(qualityProfiles);

        if (profileRows.length > 0) {
          yield* tx.insert(qualityProfiles).values([...profileRows]);
        }
      }),
    ),
  );
});

export const ensureBootstrapSystemState = Effect.fn(
  "SystemConfigRepository.ensureBootstrapSystemState",
)(function* (
  db: AppDatabase,
  coreInput: typeof appConfig.$inferInsert,
  profileRows: readonly (typeof qualityProfiles.$inferInsert)[],
) {
  yield* tryDatabase("Failed to ensure bootstrap system state", () =>
    db.transaction((tx) =>
      Effect.gen(function* () {
        const configRows = yield* tx.select().from(appConfig).where(eq(appConfig.id, 1)).limit(1);

        if (configRows.length === 0) {
          yield* tx.insert(appConfig).values(coreInput);
        }

        const existingProfiles = yield* tx.select().from(qualityProfiles).limit(1);

        if (existingProfiles.length === 0) {
          yield* tx.insert(qualityProfiles).values([...profileRows]);
        }
      }),
    ),
  );
});

export function makeSystemConfigRepositoryShape(db: AppDatabase): SystemConfigRepositoryShape {
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
