import * as Context from "effect/Context";
import * as Layer from "effect/Layer";
import * as SqlClient from "@effect/sql/SqlClient";
import * as SqliteDrizzle from "@effect/sql-drizzle/Sqlite";
import * as BunSqliteClient from "@effect/sql-sqlite-bun/SqliteClient";
import type { SqliteRemoteDatabase } from "drizzle-orm/sqlite-proxy";
import { Effect } from "effect";

import { setAndVerifyPragmas } from "@/db/database.ts";
import { runEmbeddedDrizzleMigrations } from "@/db/migrate.ts";
import { withFileSystemSandboxEffect } from "@/test/filesystem-test.ts";

export const withSqliteRawClientEffect = Effect.fn("Test.withSqliteRawClientEffect")(function* <
  A,
  E,
  R,
>(input: {
  readonly databaseFile: string;
  readonly readwrite?: boolean;
  readonly run: (client: BunSqliteClient.SqliteClient) => Effect.Effect<A, E, R>;
}) {
  const clientContext = yield* Layer.build(
    BunSqliteClient.layer({
      create: true,
      filename: input.databaseFile,
      readwrite: input.readwrite ?? true,
    }),
  );
  const client = Context.get(clientContext, BunSqliteClient.SqliteClient);

  return yield* input.run(client);
});

export const withSqliteTestDbEffect = Effect.fn("Test.withSqliteTestDbEffect")(function* <
  TSchema extends Record<string, unknown>,
  A,
  E,
  R,
>(input: {
  readonly run: (
    db: SqliteRemoteDatabase<TSchema>,
    databaseFile: string,
    client: BunSqliteClient.SqliteClient,
  ) => Effect.Effect<A, E, R>;
  readonly schema: TSchema;
}) {
  return yield* withFileSystemSandboxEffect(({ root }) =>
    Effect.scoped(
      Effect.gen(function* () {
        const databaseFile = `${root}/test.sqlite`;
        return yield* withSqliteRawClientEffect({
          databaseFile,
          run: (client) =>
            Effect.gen(function* () {
              const db = yield* SqliteDrizzle.make<TSchema>({ schema: input.schema }).pipe(
                Effect.provideService(SqlClient.SqlClient, client),
              );

              yield* setAndVerifyPragmas(client);
              yield* runEmbeddedDrizzleMigrations().pipe(
                Effect.provideService(SqlClient.SqlClient, client),
              );

              return yield* input.run(db, databaseFile, client);
            }),
        });
      }),
    ),
  );
});
