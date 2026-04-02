import * as BunSqliteClient from "@effect/sql-sqlite-bun/SqliteClient";
import { Context, Effect, Exit, Layer } from "effect";

import { Database } from "@/db/database.ts";
import { migrateDatabase } from "@/db/migrate.ts";
import { withFileSystemSandboxEffect } from "@/test/filesystem-test.ts";
import { assertEquals, it } from "@/test/vitest.ts";

it.scoped("migrateDatabase applies embedded migrations idempotently", () =>
  withFileSystemSandboxEffect(({ root }) =>
    Effect.scoped(
      Effect.gen(function* () {
        const databaseFile = `${root}/migrate.sqlite`;
        const clientContext = yield* Layer.build(
          BunSqliteClient.layer({
            create: true,
            filename: databaseFile,
            readwrite: true,
          }),
        );
        const client = Context.get(clientContext, BunSqliteClient.SqliteClient);
        const databaseLayer = Layer.succeed(Database, {
          client,
          get db(): never {
            throw new Error("migrateDatabase should not access drizzle db");
          },
        });

        const first = yield* Effect.exit(migrateDatabase().pipe(Effect.provide(databaseLayer)));
        const second = yield* Effect.exit(migrateDatabase().pipe(Effect.provide(databaseLayer)));

        assertEquals(Exit.isSuccess(first), true);
        assertEquals(Exit.isSuccess(second), true);
      }),
    ),
  ),
);
