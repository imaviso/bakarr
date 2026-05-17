import { Effect, Exit, Layer } from "effect";
import * as SqlClient from "@effect/sql/SqlClient";

import { Database, setAndVerifyPragmas } from "@/db/database.ts";
import { migrateDatabase } from "@/db/migrate.ts";
import { withFileSystemSandboxEffect } from "@/test/filesystem-test.ts";
import { withSqliteRawClientEffect } from "@/test/database-test.ts";
import { assert, it } from "@effect/vitest";

it.scoped("migrateDatabase applies embedded migrations idempotently", () =>
  withFileSystemSandboxEffect(({ root }) =>
    Effect.scoped(
      Effect.gen(function* () {
        const databaseFile = `${root}/migrate.sqlite`;
        yield* withSqliteRawClientEffect({
          databaseFile,
          run: (client) =>
            Effect.gen(function* () {
              const databaseLayer = Layer.succeed(Database, {
                client,
                get db(): never {
                  throw new Error("migrateDatabase should not access drizzle db");
                },
              });

              const first = yield* Effect.exit(
                migrateDatabase().pipe(
                  Effect.provide(databaseLayer),
                  Effect.provideService(SqlClient.SqlClient, client),
                ),
              );
              const second = yield* Effect.exit(
                migrateDatabase().pipe(
                  Effect.provide(databaseLayer),
                  Effect.provideService(SqlClient.SqlClient, client),
                ),
              );
              const tables = yield* client.unsafe<{ name: string }>(
                "select name from sqlite_master where type = 'table' and name in ('users', 'media', 'downloads') order by name",
              );

              assert.deepStrictEqual(Exit.isSuccess(first), true);
              assert.deepStrictEqual(Exit.isSuccess(second), true);
              assert.deepStrictEqual(
                tables.map((row) => row.name),
                ["downloads", "media", "users"],
              );
            }),
        });
      }),
    ),
  ),
);

it.effect("setAndVerifyPragmas succeeds when SQLite invariants hold", () =>
  Effect.gen(function* () {
    const client = makePragmaClient({ foreignKeys: 1, journalMode: "wal" });

    const exit = yield* Effect.exit(setAndVerifyPragmas(client));

    assert.deepStrictEqual(Exit.isSuccess(exit), true);
  }),
);

it.effect("setAndVerifyPragmas dies when journal mode is not WAL", () =>
  Effect.gen(function* () {
    const client = makePragmaClient({ foreignKeys: 1, journalMode: "delete" });

    const exit = yield* Effect.exit(setAndVerifyPragmas(client));

    assert.deepStrictEqual(Exit.isFailure(exit), true);
  }),
);

it.effect("setAndVerifyPragmas dies when foreign keys are disabled", () =>
  Effect.gen(function* () {
    const client = makePragmaClient({ foreignKeys: 0, journalMode: "wal" });

    const exit = yield* Effect.exit(setAndVerifyPragmas(client));

    assert.deepStrictEqual(Exit.isFailure(exit), true);
  }),
);

function makePragmaClient(input: { readonly foreignKeys: number; readonly journalMode: string }) {
  return {
    unsafe: (statement: string) => {
      if (statement === "PRAGMA journal_mode") {
        return Effect.succeed([{ journal_mode: input.journalMode }]);
      }

      if (statement === "PRAGMA foreign_keys") {
        return Effect.succeed([{ foreign_keys: input.foreignKeys }]);
      }

      return Effect.succeed([]);
    },
  };
}
