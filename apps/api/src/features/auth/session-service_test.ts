import type * as NodeSqliteClient from "@effect/sql-sqlite-node/SqliteClient";

import * as TestClock from "effect/testing/TestClock";
import { eq } from "drizzle-orm";
import { Effect, Layer, Option } from "effect";
import { assert, it } from "@effect/vitest";

import * as schema from "@/db/schema.ts";
import { AppDrizzleDatabase, type AppDatabase } from "@/db/database.ts";
import { AppConfig, makeDefaultAppConfig } from "@/app/config/schema.ts";
import { AuthUserRepository } from "@/features/auth/user-repository.ts";
import { AuthSessionService, makeAuthSessionService } from "@/features/auth/session-service.ts";
import { RandomService } from "@/infra/random.ts";
import { PasswordCrypto } from "@/security/password.ts";
import { TokenHasher } from "@/security/token-hasher.ts";
import { makeAuthUserRepository } from "@/test/repository-factories.ts";
import { withSqliteTestDbEffect } from "@/test/database-test.ts";

function makeSessionLayer(db: AppDatabase, client: NodeSqliteClient.SqliteClient) {
  const dependencies = Layer.mergeAll(
    Layer.succeed(AuthUserRepository, makeAuthUserRepository(db, client)),
    Layer.succeed(AppConfig, AppConfig.of(makeDefaultAppConfig())),
    Layer.succeed(AppDrizzleDatabase, AppDrizzleDatabase.of(db)),
    PasswordCrypto.layer,
    RandomService.layer,
    TokenHasher.layer,
  );
  return Layer.effect(AuthSessionService, makeAuthSessionService()).pipe(
    Layer.provideMerge(dependencies),
  );
}

function seedSession(input: {
  users: typeof AuthUserRepository.Service;
  hasher: typeof TokenHasher.Service;
  token: string;
  createdAt: string;
}) {
  return Effect.gen(function* () {
    yield* input.users.createBootstrapUser({
      apiKeyHash: "api-key-hash",
      createdAt: input.createdAt,
      passwordHash: "password-hash",
      username: "admin",
    });
    const user = (yield* input.users.findUserByUsername("admin")).pipe(
      Option.getOrThrow,
    );
    const tokenHash = yield* input.hasher.hashToken(input.token);
    yield* input.users.createSession({
      createdAt: input.createdAt,
      expiresAt: "2025-01-01T00:00:00.000Z",
      tokenHash,
      userId: user.id,
    });
    return tokenHash;
  });
}

function readSessionRow(db: AppDatabase, tokenHash: string) {
  return Effect.gen(function* () {
    const rows = yield* db
      .select({
        expiresAt: schema.sessions.expiresAt,
        lastSeenAt: schema.sessions.lastSeenAt,
      })
      .from(schema.sessions)
      .where(eq(schema.sessions.token, tokenHash))
      .limit(1)
      .prepare()
      .effect();
    return rows[0];
  });
}

it.effect("resolveViewer refreshes a session last seen over 5 minutes ago", () =>
  withSqliteTestDbEffect({
    run: (db, _databaseFile, client, _exec) =>
      Effect.gen(function* () {
        yield* TestClock.setTime(new Date("2024-01-01T01:00:00.000Z").getTime());

        yield* Effect.gen(function* () {
          const service = yield* AuthSessionService;
          const users = yield* AuthUserRepository;
          const hasher = yield* TokenHasher;

          const tokenHash = yield* seedSession({
            createdAt: "2024-01-01T00:50:00.000Z",
            hasher,
            token: "stale-token",
            users,
          });

          const viewer = yield* service.resolveViewer("stale-token", undefined);
          assert.deepStrictEqual(Option.isSome(viewer), true);

          const row = yield* readSessionRow(db, tokenHash);
          assert.deepStrictEqual(row?.lastSeenAt, "2024-01-01T01:00:00.000Z");
          assert.deepStrictEqual(row?.expiresAt, "2024-01-31T01:00:00.000Z");
        }).pipe(Effect.provide(makeSessionLayer(db, client)));
      }),
    schema,
  }),
);

it.effect("resolveViewer leaves a freshly seen session alone", () =>
  withSqliteTestDbEffect({
    run: (db, _databaseFile, client, _exec) =>
      Effect.gen(function* () {
        yield* TestClock.setTime(new Date("2024-01-01T01:00:00.000Z").getTime());

        yield* Effect.gen(function* () {
          const service = yield* AuthSessionService;
          const users = yield* AuthUserRepository;
          const hasher = yield* TokenHasher;

          const tokenHash = yield* seedSession({
            createdAt: "2024-01-01T00:59:00.000Z",
            hasher,
            token: "fresh-token",
            users,
          });

          const viewer = yield* service.resolveViewer("fresh-token", undefined);
          assert.deepStrictEqual(Option.isSome(viewer), true);

          const row = yield* readSessionRow(db, tokenHash);
          assert.deepStrictEqual(row?.lastSeenAt, "2024-01-01T00:59:00.000Z");
          assert.deepStrictEqual(row?.expiresAt, "2025-01-01T00:00:00.000Z");
        }).pipe(Effect.provide(makeSessionLayer(db, client)));
      }),
    schema,
  }),
);
