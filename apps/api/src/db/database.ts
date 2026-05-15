import * as SqliteDrizzle from "@effect/sql-drizzle/Sqlite";
import * as NodeSqliteClient from "@effect/sql-sqlite-node/SqliteClient";
import { Context, Effect, Layer, Schema } from "effect";
import type { SqliteRemoteDatabase } from "drizzle-orm/sqlite-proxy";

import { AppConfig } from "@/config/schema.ts";
import { isSqliteBusyLock, isSqliteUniqueConstraint } from "@/db/sqlite-errors.ts";
import * as schema from "@/db/schema.ts";

export type AppDatabase = SqliteRemoteDatabase<typeof schema>;

export class DatabaseError extends Schema.TaggedError<DatabaseError>()("DatabaseError", {
  cause: Schema.Defect,
  message: Schema.String,
}) {
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
  readonly client: NodeSqliteClient.SqliteClient;
  readonly db: AppDatabase;
}

export class Database extends Context.Tag("@bakarr/api/Database")<Database, DatabaseService>() {}

const sqliteSetupError = (cause: unknown) =>
  new DatabaseError({
    cause,
    message: "Failed to open the SQLite database",
  });

const executeSql = Effect.fn("Database.executeSql")(function* <A extends Record<string, unknown>>(
  client: NodeSqliteClient.SqliteClient,
  statement: string,
) {
  return yield* client.unsafe<A>(statement).pipe(Effect.mapError(sqliteSetupError));
});

export const setAndVerifyPragmas = Effect.fn("Database.setAndVerifyPragmas")(function* (
  client: NodeSqliteClient.SqliteClient,
) {
  yield* executeSql(client, "PRAGMA journal_mode = WAL");
  yield* executeSql(client, "PRAGMA foreign_keys = ON");

  const journalMode = yield* executeSql<Record<string, unknown>>(client, "PRAGMA journal_mode");
  const foreignKeys = yield* executeSql<Record<string, unknown>>(client, "PRAGMA foreign_keys");

  const journalModeValue = toSqlitePragmaValue(firstRowValue(journalMode[0]));
  const foreignKeysValue = toSqlitePragmaValue(firstRowValue(foreignKeys[0]));

  if (journalModeValue.toLowerCase() !== "wal") {
    return yield* Effect.dieMessage(
      `SQLite startup invariant failed: journal_mode expected wal but received ${journalModeValue || "<empty>"}`,
    );
  }

  if (foreignKeysValue !== "1") {
    return yield* Effect.dieMessage(
      `SQLite startup invariant failed: foreign_keys expected 1 but received ${foreignKeysValue || "<empty>"}`,
    );
  }

  return undefined;
});

function toSqlitePragmaValue(value: unknown) {
  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "bigint" || typeof value === "boolean") {
    return String(value);
  }

  return "";
}

function firstRowValue(row: Record<string, unknown> | undefined) {
  return row ? Object.values(row)[0] : undefined;
}

const makeDatabase = Effect.gen(function* () {
  const client = yield* NodeSqliteClient.SqliteClient;

  yield* setAndVerifyPragmas(client);

  const db = yield* SqliteDrizzle.make<typeof schema>({ schema });

  return {
    client,
    db,
  };
});

export const DatabaseLive = Layer.scoped(Database, makeDatabase);

export const DatabaseSqlClientLive = Layer.unwrapEffect(
  Effect.gen(function* () {
    const config = yield* AppConfig;

    return NodeSqliteClient.layer({
      filename: config.databaseFile,
    }).pipe(Layer.mapError(sqliteSetupError));
  }),
);

export const DatabaseLayerLive = DatabaseLive.pipe(Layer.provideMerge(DatabaseSqlClientLive));
