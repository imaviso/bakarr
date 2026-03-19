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
) {
  isUniqueConstraint(): boolean {
    return someCauseInChain(this.cause, (error) => {
      const code = typeof error.code === "string"
        ? error.code
        : String(error.code ?? error.errno ?? "");
      const message = String(error.message ?? "");
      return code === "SQLITE_CONSTRAINT" ||
        code === "SQLITE_CONSTRAINT_UNIQUE" ||
        code === "2067" ||
        code === "19" ||
        code.includes("UNIQUE constraint failed") ||
        message.includes("UNIQUE constraint failed");
    });
  }

  isBusyLock(): boolean {
    return someCauseInChain(this.cause, (error) => {
      const code = typeof error.code === "string"
        ? error.code
        : String(error.code ?? error.errno ?? "");
      const message = String(error.message ?? "");
      return code === "SQLITE_BUSY" || code === "5" ||
        message.includes("database is locked");
    });
  }
}

function someCauseInChain(
  cause: unknown,
  predicate: (error: {
    code?: string | number;
    errno?: number;
    message?: string;
  }) => boolean,
): boolean {
  const seen = new Set<unknown>();
  let current: unknown = cause;

  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);

    if (
      predicate(
        current as {
          code?: string | number;
          errno?: number;
          message?: string;
        },
      )
    ) {
      return true;
    }

    current = "cause" in current
      ? (current as { cause?: unknown }).cause
      : undefined;
  }

  return false;
}

export interface DatabaseService {
  readonly client: Client;
  readonly db: AppDatabase;
}

export class Database extends Context.Tag("@bakarr/api/Database")<
  Database,
  DatabaseService
>() {}

async function setAndVerifyPragmas(client: Client): Promise<void> {
  await client.execute("PRAGMA journal_mode = WAL");
  await client.execute("PRAGMA foreign_keys = ON");

  const journalMode = await client.execute("PRAGMA journal_mode");
  const foreignKeys = await client.execute("PRAGMA foreign_keys");

  const journalModeValue = String(journalMode.rows[0]?.[0] ?? "");
  const foreignKeysValue = String(foreignKeys.rows[0]?.[0] ?? "");

  if (journalModeValue.toLowerCase() !== "wal") {
    console.warn(
      `[Database] Warning: journal_mode is '${journalModeValue}', expected 'wal'`,
    );
  }

  if (foreignKeysValue !== "1") {
    console.error(
      `[Database] Error: foreign_keys is '${foreignKeysValue}', expected '1'. Data integrity may be compromised.`,
    );
  }
}

const makeDatabase = Effect.gen(function* () {
  const config = yield* AppConfig;

  return yield* Effect.acquireRelease(
    Effect.tryPromise({
      try: async () => {
        const client = createClient({
          url: toDatabaseUrl(config.databaseFile),
        });

        await setAndVerifyPragmas(client);

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
