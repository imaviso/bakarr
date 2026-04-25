import { eq } from "drizzle-orm";
import { Effect } from "effect";

import type { AppDatabase } from "@/db/database.ts";
import { appConfig } from "@/db/schema.ts";
import { tryDatabasePromise } from "@/infra/effect/db.ts";

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
