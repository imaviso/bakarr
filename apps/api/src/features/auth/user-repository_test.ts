import { assert, it } from "@effect/vitest";
import { eq } from "drizzle-orm";
import type { AppDatabase } from "@/db/database.ts";
import { Effect, Option } from "effect";

import { appConfig, sessions, systemLogs, users } from "@/db/schema.ts";
import { withSqliteTestDbEffect } from "@/test/database-test.ts";
import { tryDatabase } from "@/infra/effect/db.ts";

import { makeAuthUserRepository } from "@/test/repository-factories.ts";

type TestDatabase = AppDatabase;

function seedUser(db: TestDatabase) {
  return tryDatabase("Failed to seed test user", () =>
    db
      .insert(users)
      .values({
        apiKey: "hashed-key-abc123",
        createdAt: "2025-01-01T00:00:00.000Z",
        mustChangePassword: false,
        passwordHash: "pbkdf2_sha256$310000$abcd$deadbeef",
        updatedAt: "2025-01-01T00:00:00.000Z",
        username: "admin",
      })
      .returning(),
  ).pipe(Effect.map((rows) => rows[0]!));
}

function seedAppConfig(db: TestDatabase) {
  return tryDatabase("Failed to seed test appConfig", () =>
    db
      .insert(appConfig)
      .values({
        bootstrapPassword: null,
        data: "{}",
        id: 1,
        updatedAt: "2025-01-01T00:00:00.000Z",
      })
      .onConflictDoNothing(),
  );
}

it.effect("findUserByUsername returns none for missing user", () =>
  withSqliteTestDbEffect({
    run: (db) =>
      Effect.gen(function* () {
        const repo = makeAuthUserRepository(db);
        const result = yield* repo.findUserByUsername("nobody");
        assert.ok(Option.isNone(result));
      }),
  }),
);

it.effect("findUserByUsername finds existing user", () =>
  withSqliteTestDbEffect({
    run: (db) =>
      Effect.gen(function* () {
        const repo = makeAuthUserRepository(db);
        yield* seedUser(db);
        const result = yield* repo.findUserByUsername("admin");
        assert.ok(Option.isSome(result));
        assert.deepStrictEqual(result.value.username, "admin");
      }),
  }),
);

it.effect("findUserByUsername is case sensitive", () =>
  withSqliteTestDbEffect({
    run: (db) =>
      Effect.gen(function* () {
        const repo = makeAuthUserRepository(db);
        yield* seedUser(db);
        const result = yield* repo.findUserByUsername("Admin");
        assert.ok(Option.isNone(result));
      }),
  }),
);

it.effect("findUserByApiKey returns none for non-matching key", () =>
  withSqliteTestDbEffect({
    run: (db) =>
      Effect.gen(function* () {
        const repo = makeAuthUserRepository(db);
        const result = yield* repo.findUserByApiKey("wrong-key");
        assert.ok(Option.isNone(result));
      }),
  }),
);

it.effect("findUserByApiKey finds user by hashed key", () =>
  withSqliteTestDbEffect({
    run: (db) =>
      Effect.gen(function* () {
        const repo = makeAuthUserRepository(db);
        yield* seedUser(db);
        const result = yield* repo.findUserByApiKey("hashed-key-abc123");
        assert.ok(Option.isSome(result));
        assert.deepStrictEqual(result.value.username, "admin");
      }),
  }),
);

it.effect("findUserById returns none for non-existent id", () =>
  withSqliteTestDbEffect({
    run: (db) =>
      Effect.gen(function* () {
        const repo = makeAuthUserRepository(db);
        const result = yield* repo.findUserById(999);
        assert.ok(Option.isNone(result));
      }),
  }),
);

it.effect("findUserById finds existing user by id", () =>
  withSqliteTestDbEffect({
    run: (db) =>
      Effect.gen(function* () {
        const repo = makeAuthUserRepository(db);
        const user = yield* seedUser(db);
        const result = yield* repo.findUserById(user.id);
        assert.ok(Option.isSome(result));
        assert.deepStrictEqual(result.value.id, user.id);
      }),
  }),
);

it.effect("changePasswordState updates password and sets mustChangePassword to false", () =>
  withSqliteTestDbEffect({
    run: (db) =>
      Effect.gen(function* () {
        const repo = makeAuthUserRepository(db);
        const user = yield* seedUser(db);
        yield* seedAppConfig(db);

        yield* repo.changePasswordState({
          apiKeyHash: "new-api-key-hash",
          changedAt: "2025-06-01T00:00:00.000Z",
          passwordHash: "new-hash",
          userId: user.id,
          username: user.username,
        });

        const updated = yield* tryDatabase("Failed to query users after password change", () =>
          db.select().from(users).where(eq(users.id, user.id)).limit(1),
        );
        assert.deepStrictEqual(updated[0]?.passwordHash, "new-hash");
        assert.deepStrictEqual(updated[0]?.apiKey, "new-api-key-hash");
        assert.deepStrictEqual(updated[0]?.mustChangePassword, false);

        const configRow = yield* tryDatabase(
          "Failed to query appConfig after password change",
          () => db.select().from(appConfig).where(eq(appConfig.id, 1)).limit(1),
        );
        assert.deepStrictEqual(configRow[0]?.bootstrapPassword, null);
      }),
  }),
);

it.effect("changePasswordState deletes all existing sessions", () =>
  withSqliteTestDbEffect({
    run: (db) =>
      Effect.gen(function* () {
        const repo = makeAuthUserRepository(db);
        const user = yield* seedUser(db);
        yield* seedAppConfig(db);

        yield* tryDatabase("Failed to seed session 1", () =>
          db.insert(sessions).values({
            createdAt: "2025-01-01T00:00:00.000Z",
            expiresAt: "2025-12-01T00:00:00.000Z",
            lastSeenAt: "2025-01-01T00:00:00.000Z",
            token: "session-token-1",
            userId: user.id,
          }),
        );
        yield* tryDatabase("Failed to seed session 2", () =>
          db.insert(sessions).values({
            createdAt: "2025-01-02T00:00:00.000Z",
            expiresAt: "2025-12-02T00:00:00.000Z",
            lastSeenAt: "2025-01-02T00:00:00.000Z",
            token: "session-token-2",
            userId: user.id,
          }),
        );

        yield* repo.changePasswordState({
          apiKeyHash: "new-api-key-hash",
          changedAt: "2025-06-01T00:00:00.000Z",
          passwordHash: "new-hash",
          userId: user.id,
          username: user.username,
        });

        const remainingSessions = yield* tryDatabase(
          "Failed to query sessions after deletion",
          () => db.select().from(sessions).where(eq(sessions.userId, user.id)),
        );
        assert.deepStrictEqual(remainingSessions.length, 0);
      }),
  }),
);

it.effect("changePasswordState writes system log entry", () =>
  withSqliteTestDbEffect({
    run: (db) =>
      Effect.gen(function* () {
        const repo = makeAuthUserRepository(db);
        const user = yield* seedUser(db);
        yield* seedAppConfig(db);

        yield* repo.changePasswordState({
          apiKeyHash: "new-api-key-hash",
          changedAt: "2025-06-01T00:00:00.000Z",
          passwordHash: "new-hash",
          userId: user.id,
          username: user.username,
        });

        const logs = yield* tryDatabase("Failed to query systemLogs for password change", () =>
          db.select().from(systemLogs).where(eq(systemLogs.eventType, "auth.password.changed")),
        );
        assert.deepStrictEqual(logs.length, 1);
        assert.deepStrictEqual(logs[0]?.message.includes("changed"), true);
      }),
  }),
);

it.effect("regenerateApiKeyState updates apiKey and deletes sessions", () =>
  withSqliteTestDbEffect({
    run: (db) =>
      Effect.gen(function* () {
        const repo = makeAuthUserRepository(db);
        const user = yield* seedUser(db);

        yield* tryDatabase("Failed to seed session for api key regeneration", () =>
          db.insert(sessions).values({
            createdAt: "2025-01-01T00:00:00.000Z",
            expiresAt: "2025-12-01T00:00:00.000Z",
            lastSeenAt: "2025-01-01T00:00:00.000Z",
            token: "session-token-1",
            userId: user.id,
          }),
        );

        yield* repo.regenerateApiKeyState({
          apiKeyHash: "new-api-key-hash",
          regeneratedAt: "2025-06-01T00:00:00.000Z",
          userId: user.id,
          username: user.username,
        });

        const updated = yield* tryDatabase("Failed to query users after api key regeneration", () =>
          db.select().from(users).where(eq(users.id, user.id)).limit(1),
        );
        assert.deepStrictEqual(updated[0]?.apiKey, "new-api-key-hash");

        const remainingSessions = yield* tryDatabase(
          "Failed to query sessions after api key regeneration",
          () => db.select().from(sessions).where(eq(sessions.userId, user.id)),
        );
        assert.deepStrictEqual(remainingSessions.length, 0);

        const logs = yield* tryDatabase("Failed to query systemLogs for api key regeneration", () =>
          db.select().from(systemLogs).where(eq(systemLogs.eventType, "auth.api_key.regenerated")),
        );
        assert.deepStrictEqual(logs.length, 1);
      }),
  }),
);
