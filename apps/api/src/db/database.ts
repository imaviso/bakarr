// oxlint-disable typescript/no-restricted-types -- `unknown` is the honest type at error/cause boundaries (Effect error channels, try/catch causes, Logger messages)
import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as NodeSqliteClient from "@effect/sql-sqlite-node/SqliteClient";
import { Context, Effect, Layer, Schema } from "effect";
import { drizzle } from "drizzle-orm/effect/sqlite";
import type { EffectSQLiteDatabase } from "drizzle-orm/effect/sqlite/db";

import { AppConfig } from "@/app/config/schema.ts";
import { isSqliteBusyLock, isSqliteUniqueConstraint } from "@/db/sqlite-errors.ts";
import * as schema from "@/db/schema.ts";

export type AppDatabase = EffectSQLiteDatabase<typeof schema>;

export class DatabaseError extends Schema.TaggedError<DatabaseError>()("DatabaseError", {
  cause: Schema.Defect(),
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

interface SqlitePragmaClient {
  readonly unsafe: (
    statement: string,
  ) => Effect.Effect<
    ReadonlyArray<{ readonly [column: string]: string | number | bigint | boolean }>,
    unknown
  >;
}

const sqliteSetupError = (cause: unknown) =>
  new DatabaseError({
    cause,
    message: "Failed to open the SQLite database",
  });

const executeSql = Effect.fn("Database.executeSql")(function* (
  client: SqlitePragmaClient,
  statement: string,
) {
  return yield* client.unsafe(statement).pipe(Effect.mapError((cause) => sqliteSetupError(cause)));
});

const SQLITE_BUSY_TIMEOUT_MS = 5_000;
const SQLITE_CACHE_SIZE_KIB = 65_536;
const SQLITE_MMAP_SIZE_BYTES = 268_435_456;

export const setAndVerifyPragmas = Effect.fn("Database.setAndVerifyPragmas")(function* (
  client: SqlitePragmaClient,
) {
  yield* executeSql(client, "PRAGMA journal_mode = WAL");
  yield* executeSql(client, "PRAGMA foreign_keys = ON");
  yield* executeSql(client, `PRAGMA busy_timeout = ${SQLITE_BUSY_TIMEOUT_MS}`);
  yield* executeSql(client, `PRAGMA cache_size = -${SQLITE_CACHE_SIZE_KIB}`);
  yield* executeSql(client, `PRAGMA mmap_size = ${SQLITE_MMAP_SIZE_BYTES}`);

  const journalMode = yield* executeSql(client, "PRAGMA journal_mode");
  const foreignKeys = yield* executeSql(client, "PRAGMA foreign_keys");
  const busyTimeout = yield* executeSql(client, "PRAGMA busy_timeout");

  const journalModeValue = toSqlitePragmaValue(firstRowValue(journalMode[0]));
  const foreignKeysValue = toSqlitePragmaValue(firstRowValue(foreignKeys[0]));
  const busyTimeoutValue = toSqlitePragmaValue(firstRowValue(busyTimeout[0]));

  if (journalModeValue.toLowerCase() !== "wal") {
    return yield* Effect.die(
      new Error(
        `SQLite startup invariant failed: journal_mode expected wal but received ${journalModeValue || "<empty>"}`,
      ),
    );
  }

  if (foreignKeysValue !== "1") {
    return yield* Effect.die(
      new Error(
        `SQLite startup invariant failed: foreign_keys expected 1 but received ${foreignKeysValue || "<empty>"}`,
      ),
    );
  }

  if (busyTimeoutValue !== String(SQLITE_BUSY_TIMEOUT_MS)) {
    return yield* Effect.die(
      new Error(
        `SQLite startup invariant failed: busy_timeout expected ${SQLITE_BUSY_TIMEOUT_MS} but received ${busyTimeoutValue || "<empty>"}`,
      ),
    );
  }

  return undefined;
});

function toSqlitePragmaValue(value: string | number | bigint | boolean | undefined): string {
  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "bigint" || typeof value === "boolean") {
    return String(value);
  }

  return "";
}

function firstRowValue(
  row: { readonly [column: string]: string | number | bigint | boolean } | undefined,
) {
  return row ? Object.values(row)[0] : undefined;
}

const makeAppDrizzleDatabase = Effect.fn("AppDrizzleDatabase.make")(function* () {
  const client = yield* NodeSqliteClient.SqliteClient;

  yield* setAndVerifyPragmas(client);

  return drizzle<typeof schema>({ schema });
});

export const DatabaseSqlClientLive = Layer.unwrap(
  Effect.gen(function* () {
    const config = yield* AppConfig;

    return NodeSqliteClient.layer({
      filename: config.databaseFile,
    });
  }),
);

export class AppDrizzleDatabase extends Context.Service<AppDrizzleDatabase, AppDatabase>()(
  "@bakarr/api/AppDrizzleDatabase",
) {
  static readonly layer = Layer.effect(AppDrizzleDatabase, makeAppDrizzleDatabase()).pipe(
    Layer.provide(DatabaseSqlClientLive),
  );
}

export class AppSqlClient extends Context.Service<AppSqlClient, SqlClient.SqlClient>()(
  "@bakarr/api/AppSqlClient",
) {
  static readonly layer = Layer.effect(
    AppSqlClient,
    Effect.gen(function* () {
      return yield* SqlClient.SqlClient;
    }),
  ).pipe(Layer.provide(DatabaseSqlClientLive));
}

export const DatabaseLayerLive = Layer.mergeAll(AppDrizzleDatabase.layer, AppSqlClient.layer);
