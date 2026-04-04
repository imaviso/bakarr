import { Effect, Exit, Layer } from "effect";

import { Database } from "@/db/database.ts";
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
                  return Effect.runSync(
                    Effect.dieMessage("migrateDatabase should not access drizzle db"),
                  );
                },
              });

              const first = yield* Effect.exit(
                migrateDatabase().pipe(Effect.provide(databaseLayer)),
              );
              const second = yield* Effect.exit(
                migrateDatabase().pipe(Effect.provide(databaseLayer)),
              );
              const tables = yield* client.unsafe<{ name: string }>(
                "select name from sqlite_master where type = 'table' and name in ('users', 'anime', 'downloads') order by name",
              );

              assert.deepStrictEqual(Exit.isSuccess(first), true);
              assert.deepStrictEqual(Exit.isSuccess(second), true);
              assert.deepStrictEqual(
                tables.map((row) => row.name),
                ["anime", "downloads", "users"],
              );
            }),
        });
      }),
    ),
  ),
);
