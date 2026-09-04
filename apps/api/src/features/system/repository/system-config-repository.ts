import { eq } from "drizzle-orm";
import * as NodeSqliteClient from "@effect/sql-sqlite-node/SqliteClient";

import { AppDrizzleDatabase, type AppDatabase, type DatabaseError } from "@/db/database.ts";
import { appConfig, qualityProfiles } from "@/db/schema.ts";
import { makeDbExecutor, type DbExecutor } from "@/infra/effect/db.ts";
import { Context, Effect, Layer, Option } from "effect";

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

export class SystemConfigRepository extends Context.Service<
  SystemConfigRepository,
  SystemConfigRepositoryShape
>()("@bakarr/api/SystemConfigRepository") {
  static readonly layer = Layer.effect(
    SystemConfigRepository,
    Effect.gen(function* () {
      const db = yield* AppDrizzleDatabase;
      const sqlClient = yield* NodeSqliteClient.SqliteClient;
      return makeSystemConfigRepositoryShape(db, sqlClient);
    }),
  );
}

export const loadSystemConfigRow = Effect.fn("SystemConfigRepository.loadSystemConfigRow")(
  function* (db: AppDatabase, exec: DbExecutor) {
    const row = yield* exec.queryFirst(
      "Failed to load system config",
      db.select().from(appConfig).where(eq(appConfig.id, 1)).limit(1).prepare().effect(),
    );

    return Option.getOrUndefined(row);
  },
);

export const updateSystemConfigAtomic = Effect.fn(
  "SystemConfigRepository.updateSystemConfigAtomic",
)(function* (
  db: AppDatabase,
  exec: DbExecutor,
  coreInput: typeof appConfig.$inferInsert,
  profileRows: readonly (typeof qualityProfiles.$inferInsert)[],
) {
  yield* exec.runTransaction(
    "Failed to update system config",
    Effect.gen(function* () {
      yield* db
        .insert(appConfig)
        .values(coreInput)
        .onConflictDoUpdate({
          target: appConfig.id,
          set: { data: coreInput.data, updatedAt: coreInput.updatedAt },
        })
        .prepare()
        .effect();

      yield* db.delete(qualityProfiles).prepare().effect();

      if (profileRows.length > 0) {
        yield* db
          .insert(qualityProfiles)
          .values([...profileRows])
          .prepare()
          .effect();
      }
    }),
  );
});

export const ensureBootstrapSystemState = Effect.fn(
  "SystemConfigRepository.ensureBootstrapSystemState",
)(function* (
  db: AppDatabase,
  exec: DbExecutor,
  coreInput: typeof appConfig.$inferInsert,
  profileRows: readonly (typeof qualityProfiles.$inferInsert)[],
) {
  yield* exec.runTransaction(
    "Failed to ensure bootstrap system state",
    Effect.gen(function* () {
      const configRows = yield* db
        .select()
        .from(appConfig)
        .where(eq(appConfig.id, 1))
        .limit(1)
        .prepare()
        .effect();

      if (configRows.length === 0) {
        yield* db.insert(appConfig).values(coreInput).prepare().effect();
      }

      const existingProfiles = yield* db.select().from(qualityProfiles).limit(1).prepare().effect();

      if (existingProfiles.length === 0) {
        yield* db
          .insert(qualityProfiles)
          .values([...profileRows])
          .prepare()
          .effect();
      }
    }),
  );
});

export function makeSystemConfigRepositoryShape(
  db: AppDatabase,
  sqlClient: NodeSqliteClient.SqliteClient,
): SystemConfigRepositoryShape {
  const exec = makeDbExecutor(sqlClient);
  return {
    ensureBootstrapSystemState: (coreInput, profileRows) =>
      ensureBootstrapSystemState(db, exec, coreInput, profileRows),
    loadSystemConfigRow: () => loadSystemConfigRow(db, exec),
    updateSystemConfigAtomic: (coreInput, profileRows) =>
      updateSystemConfigAtomic(db, exec, coreInput, profileRows),
  } satisfies SystemConfigRepositoryShape;
}
