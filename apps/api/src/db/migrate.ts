import { Effect } from "effect";
import { migrate } from "drizzle-orm/libsql/migrator";

import { Database, DatabaseError } from "./database.ts";

export const migrateDatabase = Effect.fn("Database.migrate")(function* () {
  const { db } = yield* Database;

  yield* Effect.tryPromise({
    try: () => migrate(db, { migrationsFolder: "./drizzle" }),
    catch: (cause) =>
      new DatabaseError({
        cause,
        message: "Failed to run database migrations",
      }),
  });
});
