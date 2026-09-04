import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as NodeSqliteClient from "@effect/sql-sqlite-node/SqliteClient";
import type { EffectSQLiteDatabase } from "drizzle-orm/effect/sqlite/db";
import { drizzle } from "drizzle-orm/effect/sqlite";

import { setAndVerifyPragmas } from "@/db/database.ts";
import { runEmbeddedDrizzleMigrations } from "@/db/migrate.ts";
import { makeDbExecutor, type DbExecutor } from "@/infra/effect/db.ts";
import { withFileSystemSandboxEffect } from "@/test/filesystem-test.ts";
import { Effect, Record } from "effect";

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
  // oxlint-disable-next-line typescript/no-restricted-types -- drizzle requires Record<string, unknown> for schema maps
  TSchema extends Record<string, unknown>,
  A,
  E,
  R,
>(input: {
  readonly run: (
    db: EffectSQLiteDatabase<TSchema>,
    databaseFile: string,
    client: NodeSqliteClient.SqliteClient,
    exec: DbExecutor,
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
              const db = drizzle<TSchema>({ schema: input.schema });

              yield* setAndVerifyPragmas(client);
              yield* runEmbeddedDrizzleMigrations().pipe(
                Effect.provideService(SqlClient.SqlClient, client),
              );

              return yield* input.run(db, databaseFile, client, makeDbExecutor(client));
            }),
        });
      }),
    ),
  );
});
