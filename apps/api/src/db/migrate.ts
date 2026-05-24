import * as Migrator from "@effect/sql/Migrator";
import * as SqlClient from "@effect/sql/SqlClient";
import { Effect } from "effect";

import { AppSqlClient, DatabaseError } from "@/db/database.ts";
import { embeddedDrizzleMigrations } from "@/generated/embedded-drizzle-migrations.ts";

const applyMigrationStatements = Effect.fn("Database.applyMigrationStatements")(function* (
  statements: readonly string[],
) {
  const sql = yield* SqlClient.SqlClient;

  yield* sql.withTransaction(
    Effect.forEach(statements, (statement) => sql.unsafe(statement), { discard: true }),
  );
});

const embeddedDrizzleMigrationLoader = Migrator.fromRecord(
  Object.fromEntries(
    Object.entries(embeddedDrizzleMigrations).map(([migrationName, statements]) => [
      migrationName,
      applyMigrationStatements(statements),
    ]),
  ),
);

export const runEmbeddedDrizzleMigrations = Effect.fn("Database.runEmbeddedDrizzleMigrations")(
  function* () {
    return yield* Migrator.make({})({ loader: embeddedDrizzleMigrationLoader });
  },
);

/**
 * Startup migration strategy (blocking, fail-fast):
 *
 * Called during {@link bootstrap} in main.ts as the first step of the startup
 * sequence. Migrations run synchronously against the SQLite database before any
 * services are initialized. If a migration fails, the startup Effect fails with
 * a {@link DatabaseError} and the process exits. Each migration file runs inside
 * one SQL transaction so a failed statement does not leave earlier statements
 * from the same file partially applied.
 *
 * This is intentional for a single-user LAN deployment: a half-migrated
 * database should not silently serve requests.
 */
export const migrateDatabase = Effect.fn("Database.migrate")(function* () {
  const client = yield* AppSqlClient;

  yield* runEmbeddedDrizzleMigrations().pipe(
    Effect.provideService(SqlClient.SqlClient, client),
    Effect.mapError(
      (cause) =>
        new DatabaseError({
          cause,
          message: "Failed to run database migrations",
        }),
    ),
  );

  yield* client.unsafe("PRAGMA optimize").pipe(
    Effect.mapError(
      (cause) =>
        new DatabaseError({
          cause,
          message: "Failed to optimize SQLite query planner statistics",
        }),
    ),
  );
});
