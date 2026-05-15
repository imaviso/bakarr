import { eq } from "drizzle-orm";
import { Context, Effect, Layer } from "effect";

import { Database, type AppDatabase, type DatabaseError } from "@/db/database.ts";
import { appConfig } from "@/db/schema.ts";
import { tryDatabasePromise } from "@/infra/effect/db.ts";

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
}

export class SystemConfigRepository extends Context.Tag("@bakarr/api/SystemConfigRepository")<
  SystemConfigRepository,
  SystemConfigRepositoryShape
>() {}

export const loadSystemConfigRow = Effect.fn("SystemConfigRepository.loadSystemConfigRow")(
  function* (db: AppDatabase) {
    const rows = yield* tryDatabasePromise("Failed to load system config", () =>
      db.select().from(appConfig).where(eq(appConfig.id, 1)).limit(1),
    );

    return rows[0];
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

export function makeSystemConfigRepository(db: AppDatabase): SystemConfigRepositoryShape {
  return SystemConfigRepository.of({
    insertSystemConfigRow: (input) => insertSystemConfigRow(db, input),
    loadSystemConfigRow: () => loadSystemConfigRow(db),
    upsertSystemConfigRow: (input) => upsertSystemConfigRow(db, input),
  });
}

export const SystemConfigRepositoryLive = Layer.effect(
  SystemConfigRepository,
  Effect.gen(function* () {
    const { db } = yield* Database;
    return makeSystemConfigRepository(db);
  }),
);
