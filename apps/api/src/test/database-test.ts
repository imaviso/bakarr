import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { Effect } from "effect";

import {
  withFileSystemSandbox,
  withFileSystemSandboxEffect,
} from "./filesystem-test.ts";

export const withSqliteTestDbEffect = Effect.fn("Test.withSqliteTestDbEffect")(
  function* <TSchema extends Record<string, unknown>, A, E, R>(input: {
    readonly migrationsFolder: string;
    readonly run: (
      db: ReturnType<typeof drizzle<TSchema>>,
      databaseFile: string,
    ) => Effect.Effect<A, E, R>;
    readonly schema: TSchema;
  }) {
    return yield* withFileSystemSandboxEffect(({ root }) =>
      Effect.acquireUseRelease(
        Effect.sync(() => {
          const databaseFile = `${root}/test.sqlite`;
          const client = createClient({ url: `file:${databaseFile}` });
          const db = drizzle({ client, schema: input.schema });

          return { client, databaseFile, db };
        }),
        ({ databaseFile, db }) =>
          Effect.tryPromise(() =>
            migrate(db, { migrationsFolder: input.migrationsFolder })
          ).pipe(
            Effect.zipRight(input.run(db, databaseFile)),
          ),
        ({ client }) => Effect.sync(() => client.close()),
      )
    );
  },
);

export async function withSqliteTestDb<
  TSchema extends Record<string, unknown>,
  A,
>(
  input: {
    readonly migrationsFolder: string;
    readonly run: (
      db: ReturnType<typeof drizzle<TSchema>>,
      databaseFile: string,
    ) => Promise<A> | A;
    readonly schema: TSchema;
  },
): Promise<A> {
  return await withFileSystemSandbox(async ({ root }) => {
    const databaseFile = `${root}/test.sqlite`;
    const client = createClient({ url: `file:${databaseFile}` });
    const db = drizzle({ client, schema: input.schema });

    try {
      await migrate(db, { migrationsFolder: input.migrationsFolder });
      return await input.run(db, databaseFile);
    } finally {
      client.close();
    }
  });
}
