import * as Context from "effect/Context";
import * as Layer from "effect/Layer";
import * as SqlClient from "@effect/sql/SqlClient";
import * as SqliteDrizzle from "@effect/sql-drizzle/Sqlite";
import * as BunSqliteClient from "@effect/sql-sqlite-bun/SqliteClient";
import type { SqliteRemoteDatabase } from "drizzle-orm/sqlite-proxy";
import { Effect } from "effect";

import { configureDatabasePragmas } from "@/db/database.ts";
import { runEmbeddedDrizzleMigrations } from "@/db/migrate.ts";
import { withFileSystemSandboxEffect } from "@/test/filesystem-test.ts";

export const withSqliteTestDbEffect = Effect.fn("Test.withSqliteTestDbEffect")(function* <
  TSchema extends Record<string, unknown>,
  A,
  E,
  R,
>(input: {
  readonly run: (db: SqliteRemoteDatabase<TSchema>, databaseFile: string) => Effect.Effect<A, E, R>;
  readonly schema: TSchema;
}) {
  return yield* withFileSystemSandboxEffect(({ root }) =>
    Effect.scoped(
      Effect.gen(function* () {
        const databaseFile = `${root}/test.sqlite`;
        const clientContext = yield* Layer.build(
          BunSqliteClient.layer({
            create: true,
            filename: databaseFile,
            readwrite: true,
          }),
        );
        const client = Context.get(clientContext, BunSqliteClient.SqliteClient);
        const db = yield* SqliteDrizzle.make<TSchema>({ schema: input.schema }).pipe(
          Effect.provideService(SqlClient.SqlClient, client),
        );

        yield* configureDatabasePragmas(client);
        yield* runEmbeddedDrizzleMigrations(client);

        return yield* input.run(db, databaseFile);
      }),
    ),
  );
});

export async function withSqliteTestDb<TSchema extends Record<string, unknown>, A>(input: {
  readonly run: (db: SqliteRemoteDatabase<TSchema>, databaseFile: string) => Promise<A> | A;
  readonly schema: TSchema;
}): Promise<A> {
  return await Effect.runPromise(
    Effect.scoped(
      withSqliteTestDbEffect({
        run: (db, databaseFile) =>
          Effect.tryPromise(() => Promise.resolve(input.run(db, databaseFile))),
        schema: input.schema,
      }),
    ),
  );
}
