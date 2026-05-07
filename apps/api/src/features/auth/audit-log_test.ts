import { assert, it } from "@effect/vitest";
import { eq } from "drizzle-orm";
import { Effect } from "effect";

import * as schema from "@/db/schema.ts";
import { systemLogs } from "@/db/schema.ts";
import { withSqliteTestDbEffect } from "@/test/database-test.ts";
import { writeAuthLog } from "@/features/auth/audit-log.ts";

it.scoped("writeAuthLog inserts a system log row", () =>
  withSqliteTestDbEffect({
    run: (db) =>
      Effect.gen(function* () {
        yield* writeAuthLog(
          db,
          {
            eventType: "auth.login",
            level: "success",
            message: "testuser signed in",
          },
          () => Effect.succeed("2025-06-01T00:00:00.000Z"),
        );

        const rows = yield* Effect.promise(() =>
          db.select().from(systemLogs).where(eq(systemLogs.eventType, "auth.login")),
        );
        assert.deepStrictEqual(rows.length, 1);
        assert.deepStrictEqual(rows[0]?.message, "testuser signed in");
        assert.deepStrictEqual(rows[0]?.level, "success");
        assert.deepStrictEqual(rows[0]?.createdAt, "2025-06-01T00:00:00.000Z");
      }),
    schema,
  }),
);

it.scoped("writeAuthLog inserts with optional details", () =>
  withSqliteTestDbEffect({
    run: (db) =>
      Effect.gen(function* () {
        yield* writeAuthLog(
          db,
          {
            details: "extra info",
            eventType: "auth.login",
            level: "warn",
            message: "login attempt",
          },
          () => Effect.succeed("2025-06-01T00:00:00.000Z"),
        );

        const rows = yield* Effect.promise(() =>
          db.select().from(systemLogs).where(eq(systemLogs.eventType, "auth.login")),
        );
        assert.deepStrictEqual(rows[0]?.details, "extra info");
        assert.deepStrictEqual(rows[0]?.level, "warn");
      }),
    schema,
  }),
);

it.scoped("writeAuthLog inserts multiple distinct log entries", () =>
  withSqliteTestDbEffect({
    run: (db) =>
      Effect.gen(function* () {
        yield* writeAuthLog(db, { eventType: "auth.login", level: "info", message: "first" }, () =>
          Effect.succeed("2025-01-01T00:00:00.000Z"),
        );
        yield* writeAuthLog(
          db,
          { eventType: "auth.logout", level: "info", message: "second" },
          () => Effect.succeed("2025-06-01T00:00:00.000Z"),
        );

        const all = yield* Effect.promise(() => db.select().from(systemLogs));
        assert.deepStrictEqual(all.length, 2);
      }),
    schema,
  }),
);
