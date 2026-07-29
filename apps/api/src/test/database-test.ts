import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as NodeSqliteClient from "@effect/sql-sqlite-node/SqliteClient";
import * as SQLiteNodeDrizzle from "drizzle-orm/effect-sqlite-node";
import { Effect } from "effect";

import { setAndVerifyPragmas, type AppDatabase } from "@/db/database.ts";
import { runEmbeddedDrizzleMigrations } from "@/db/migrate.ts";
import { withFileSystemSandboxEffect } from "@/test/filesystem-test.ts";

export const withSqliteRawClientEffect = Effect.fn("Test.withSqliteRawClientEffect")(function* <
  A,
  E,
  R,
>(input: {
  readonly databaseFile: string;
  readonly readwrite?: boolean;
  readonly run: (client: NodeSqliteClient.SqliteClient) => Effect.Effect<A, E, R>;
}) {
  return yield* Effect.scoped(
    Effect.gen(function* () {
      const client = yield* NodeSqliteClient.SqliteClient;

      return yield* input.run(client);
    }),
  ).pipe(
    Effect.provide(
      NodeSqliteClient.layer({
        filename: input.databaseFile,
        readonly: input.readwrite === false,
      }),
    ),
  );
});

export const withSqliteTestDbEffect = Effect.fn("Test.withSqliteTestDbEffect")(function* <
  A,
  E,
  R,
>(input: {
  readonly run: (
    db: AppDatabase,
    databaseFile: string,
    client: NodeSqliteClient.SqliteClient,
  ) => Effect.Effect<A, E, R>;
}) {
  return yield* withFileSystemSandboxEffect(({ root }) =>
    Effect.scoped(
      Effect.gen(function* () {
        const databaseFile = `${root}/test.sqlite`;
        return yield* withSqliteRawClientEffect({
          databaseFile,
          run: (client) =>
            Effect.gen(function* () {
              const db = yield* SQLiteNodeDrizzle.makeWithDefaults().pipe(
                Effect.provideService(NodeSqliteClient.SqliteClient, client),
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
