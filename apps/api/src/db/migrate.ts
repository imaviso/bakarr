import { Effect } from "effect";
import { migrate } from "drizzle-orm/libsql/migrator";

import { Database, DatabaseError } from "./database.ts";

export const DRIZZLE_MIGRATIONS_FOLDER = new URL(
  "../../drizzle",
  import.meta.url,
).pathname;

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
