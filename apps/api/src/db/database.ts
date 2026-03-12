import { Context, Effect, Layer, Schema } from "effect";
import { type Client, createClient } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";

import { AppConfig } from "../config.ts";
import * as schema from "./schema.ts";

export type AppDatabase = LibSQLDatabase<typeof schema>;

export class DatabaseError extends Schema.TaggedError<DatabaseError>()(
  "DatabaseError",
  {
    cause: Schema.Defect,
    message: Schema.String,
  },
) {}

export interface DatabaseService {
  readonly client: Client;
  readonly db: AppDatabase;
}

export class Database extends Context.Tag("@bakarr/api/Database")<
  Database,
  DatabaseService
>() {}

const makeDatabase = Effect.gen(function* () {
  const config = yield* AppConfig;

  return yield* Effect.acquireRelease(
    Effect.try({
      try: () => {
        const client = createClient({
          url: toDatabaseUrl(config.databaseFile),
        });

        return {
          client,
          db: drizzle({ client, schema }),
        };
      },
      catch: (cause) =>
        new DatabaseError({
          cause,
          message: "Failed to open the SQLite database",
        }),
    }),
    ({ client }) => Effect.sync(() => client.close()),
  );
});

export const DatabaseLive = Layer.scoped(Database, makeDatabase);

function toDatabaseUrl(databaseFile: string): string {
  if (databaseFile.startsWith("file:")) {
    return databaseFile;
  }

  return `file:${databaseFile}`;
}
