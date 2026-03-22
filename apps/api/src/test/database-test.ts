import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";

import { withFileSystemSandbox } from "./filesystem-test.ts";

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
