// oxlint-disable typescript/no-restricted-types -- `unknown` is the honest type at error/cause boundaries (Effect error channels, try/catch causes, Logger messages)
import * as NodeSqliteClient from "@effect/sql-sqlite-node/SqliteClient";
import { Effect, Option, Schedule } from "effect";
import type * as SqlError from "effect/unstable/sql/SqlError";

import { DatabaseError } from "@/db/database.ts";

/**
 * Correct the `drizzle-orm@1.0.0-beta.1-cdf226f` (`effect` dist-tag) prepared
 * query types to match their runtime behavior.
 *
 * The beta builds every query with `EffectSQLiteSession`, so `prepare()` on
 * any select/insert/update/delete builder returns an `EffectSQLitePreparedQuery`
 * whose terminal methods are Effects requiring `SqliteClient` — but the static
 * types still describe the sync driver (`run: unknown`, no `.effect()`), and
 * chained selects reconstruct to `Omit<SQLiteSelectBase>` which drops the
 * Effect interface. The declarations below restore the single uniform execution
 * shape used across this codebase: `db.<op>(...).<chain>().prepare().effect()`.
 *
 * `db.transaction()` is NOT covered: `EffectSQLiteSession.transaction` throws
 * `Not implemented!` at runtime. Use `DbExecutor.runTransaction` (which runs
 * the body via `SqliteClient.withTransaction`, so all drizzle queries inside
 * transparently use the transaction connection) instead.
 */
declare module "drizzle-orm/sqlite-core/session" {
  interface SQLitePreparedQuery<
    T extends import("drizzle-orm/sqlite-core/session").PreparedQueryConfig,
  > {
    effect(): Effect.Effect<T["execute"], SqlError.SqlError, NodeSqliteClient.SqliteClient>;
  }
}

export type TryDatabaseQuery = <A, E, R>(
  message: string,
  query: Effect.Effect<A, E, R>,
) => Effect.Effect<A, DatabaseError, R>;

const DATABASE_BUSY_RETRY_DELAY = "25 millis";
const DATABASE_BUSY_RETRY_COUNT = 8;

export function toDatabaseError(message: string) {
  return (cause: unknown) =>
    cause instanceof DatabaseError ? cause : new DatabaseError({ cause, message });
}

export const tryDatabaseQuery: TryDatabaseQuery = Effect.fn("Database.tryDatabaseQuery")(
  <A, E, R>(message: string, query: Effect.Effect<A, E, R>): Effect.Effect<A, DatabaseError, R> =>
    query.pipe(
      Effect.mapError(toDatabaseError(message)),
      Effect.retry(
        Schedule.spaced(DATABASE_BUSY_RETRY_DELAY).pipe(
          Schedule.while(({ input }: { input: DatabaseError }) => input.isBusyLock()),
          Schedule.upTo({ times: DATABASE_BUSY_RETRY_COUNT }),
        ),
      ),
    ),
);

export const queryFirst = Effect.fn("Database.queryFirst")(
  <A, E, R>(
    message: string,
    query: Effect.Effect<readonly A[], E, R>,
  ): Effect.Effect<Option.Option<A>, DatabaseError, R> =>
    tryDatabaseQuery(message, query).pipe(Effect.map((rows) => Option.fromNullishOr(rows[0]))),
);

export interface DbExecutor {
  readonly runQuery: <A, E>(
    message: string,
    query: Effect.Effect<A, E, NodeSqliteClient.SqliteClient>,
  ) => Effect.Effect<A, DatabaseError>;
  readonly queryFirst: <A, E>(
    message: string,
    query: Effect.Effect<readonly A[], E, NodeSqliteClient.SqliteClient>,
  ) => Effect.Effect<Option.Option<A>, DatabaseError>;
  readonly runTransaction: <A, E>(
    message: string,
    body: Effect.Effect<A, E, NodeSqliteClient.SqliteClient>,
  ) => Effect.Effect<A, DatabaseError>;
}

/**
 * Binds drizzle query execution to one `SqliteClient` service value.
 *
 * Repositories capture the client at layer construction (alongside the
 * drizzle `AppDatabase`) so query effects keep `R = never` in the public
 * service shapes — callers never see the client requirement. Transaction
 * bodies run via `client.withTransaction`, which routes every drizzle query
 * inside the body to the transaction connection through the shared
 * transaction service, so providing the outer client value stays correct
 * inside transactions as well.
 */
export function makeDbExecutor(client: NodeSqliteClient.SqliteClient): DbExecutor {
  const provideClient = <A, E>(
    effect: Effect.Effect<A, E, NodeSqliteClient.SqliteClient>,
  ): Effect.Effect<A, E> => Effect.provideService(effect, NodeSqliteClient.SqliteClient, client);

  const runQuery: DbExecutor["runQuery"] = (message, query) =>
    tryDatabaseQuery(message, provideClient(query));

  const queryFirstQuery: DbExecutor["queryFirst"] = (message, query) =>
    runQuery(message, query).pipe(Effect.map((rows) => Option.fromNullishOr(rows[0])));

  const runTransaction: DbExecutor["runTransaction"] = (message, body) =>
    tryDatabaseQuery(message, provideClient(client.withTransaction(body)));

  return { queryFirst: queryFirstQuery, runQuery, runTransaction };
}
