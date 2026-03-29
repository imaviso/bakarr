import { Effect } from "effect";
import { migrate } from "drizzle-orm/libsql/migrator";

import { Database, DatabaseError } from "@/db/database.ts";

export const DRIZZLE_MIGRATIONS_FOLDER = new URL("../../drizzle", import.meta.url).pathname;

/**
 * Startup migration strategy (blocking, fail-fast):
 *
 * Called during {@link bootstrap} in main.ts as the first step of the startup
 * sequence. Migrations run synchronously against the SQLite database before any
 * services are initialized. If a migration fails, the startup Effect fails with
 * a {@link DatabaseError} and the process exits — there is no automatic rollback
 * or retry. The operator must fix the migration or database state and restart.
 *
 * This is intentional for a single-user LAN deployment: a half-migrated
 * database should not silently serve requests.
 */
export const migrateDatabase = Effect.fn("Database.migrate")(function* () {
  const { db } = yield* Database;

  yield* Effect.tryPromise({
    try: () => migrate(db, { migrationsFolder: DRIZZLE_MIGRATIONS_FOLDER }),
    catch: (cause) =>
      new DatabaseError({
        cause,
        message: "Failed to run database migrations",
      }),
  });
});
