import { Context, Effect, Layer, Schema } from "effect";
import { type Client, createClient } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";

import { AppConfig } from "../config.ts";
import { isSqliteBusyLock, isSqliteUniqueConstraint } from "./sqlite-errors.ts";
import * as schema from "./schema.ts";

export type AppDatabase = LibSQLDatabase<typeof schema>;

export class DatabaseError extends Schema.TaggedError<DatabaseError>()(
  "DatabaseError",
  {
    cause: Schema.Defect,
    message: Schema.String,
  },
) {
  isUniqueConstraint(): boolean {
    return isSqliteUniqueConstraint(this.cause);
  }

  isBusyLock(): boolean {
    return isSqliteBusyLock(this.cause);
  }
}

/** Check if a raw error cause represents an SQLite busy/lock condition. */
export function isBusySqliteCause(cause: unknown): boolean {
  return isSqliteBusyLock(cause);
}

export interface DatabaseService {
  readonly client: Client;
  readonly db: AppDatabase;
}

export class Database extends Context.Tag("@bakarr/api/Database")<
  Database,
  DatabaseService
>() {}

const sqliteSetupError = (cause: unknown) =>
  new DatabaseError({
    cause,
    message: "Failed to open the SQLite database",
  });

const executeSql = Effect.fn("Database.executeSql")(
  function* (client: Client, statement: string) {
    return yield* Effect.tryPromise({
      try: () => client.execute(statement),
      catch: sqliteSetupError,
    });
  },
);

const setAndVerifyPragmas = Effect.fn("Database.setAndVerifyPragmas")(
  function* (client: Client) {
    yield* executeSql(client, "PRAGMA journal_mode = WAL");
    yield* executeSql(client, "PRAGMA foreign_keys = ON");

    const journalMode = yield* executeSql(client, "PRAGMA journal_mode");
    const foreignKeys = yield* executeSql(client, "PRAGMA foreign_keys");

    const journalModeValue = String(journalMode.rows[0]?.[0] ?? "");
    const foreignKeysValue = String(foreignKeys.rows[0]?.[0] ?? "");

    if (journalModeValue.toLowerCase() !== "wal") {
      yield* Effect.logWarning("SQLite pragma mismatch").pipe(
        Effect.annotateLogs({
          actual: journalModeValue,
          expected: "wal",
          pragma: "journal_mode",
        }),
      );
    }

    if (foreignKeysValue !== "1") {
      yield* Effect.logError("SQLite pragma mismatch").pipe(
        Effect.annotateLogs({
          actual: foreignKeysValue,
          expected: "1",
          pragma: "foreign_keys",
          risk: "Data integrity may be compromised",
        }),
      );
    }
  },
);

const makeDatabase = Effect.gen(function* () {
  const config = yield* AppConfig;
  const client = yield* Effect.acquireRelease(
    Effect.try({
      try: () =>
        createClient({
          url: toDatabaseUrl(config.databaseFile),
        }),
      catch: sqliteSetupError,
    }),
    (client) => Effect.sync(() => client.close()),
  );

  yield* setAndVerifyPragmas(client);

  return {
    client,
    db: drizzle({ client, schema }),
  };
});

export const DatabaseLive = Layer.scoped(Database, makeDatabase);

function toDatabaseUrl(databaseFile: string): string {
  if (databaseFile.startsWith("file:")) {
    return databaseFile;
  }

  return `file:${databaseFile}`;
}
