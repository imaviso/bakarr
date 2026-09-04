import { desc, eq } from "drizzle-orm";
import * as NodeSqliteClient from "@effect/sql-sqlite-node/SqliteClient";

import type { RssFeed } from "@packages/shared/index.ts";
import { AppDrizzleDatabase, DatabaseError, type AppDatabase } from "@/db/database.ts";
import { rssFeeds } from "@/db/schema.ts";
import { toRssFeed } from "@/features/operations/repository/rss-repository.ts";
import { makeDbExecutor, type DbExecutor } from "@/infra/effect/db.ts";
import { Context, Effect, Layer } from "effect";

type RssFeedRow = typeof rssFeeds.$inferSelect;

export interface RssFeedRepositoryShape {
  readonly deleteById: (id: number) => Effect.Effect<void, DatabaseError>;
  readonly insertFeed: (input: {
    readonly createdAt: string;
    readonly mediaId: number;
    readonly name: string | null;
    readonly url: string;
  }) => Effect.Effect<RssFeed, DatabaseError>;
  readonly listAll: () => Effect.Effect<RssFeed[], DatabaseError>;
  readonly listByMediaId: (mediaId: number) => Effect.Effect<RssFeed[], DatabaseError>;
  readonly listEnabledRows: () => Effect.Effect<readonly RssFeedRow[], DatabaseError>;
  readonly markLastChecked: (id: number, lastChecked: string) => Effect.Effect<void, DatabaseError>;
  readonly setEnabled: (id: number, enabled: boolean) => Effect.Effect<void, DatabaseError>;
}

export class RssFeedRepository extends Context.Service<RssFeedRepository, RssFeedRepositoryShape>()(
  "@bakarr/api/RssFeedRepository",
) {
  static readonly layer = Layer.effect(
    RssFeedRepository,
    Effect.gen(function* () {
      const db = yield* AppDrizzleDatabase;
      const sqlClient = yield* NodeSqliteClient.SqliteClient;
      return makeRssFeedRepositoryShape(db, sqlClient);
    }),
  );
}

export function makeRssFeedRepositoryShape(
  db: AppDatabase,
  sqlClient: NodeSqliteClient.SqliteClient,
): RssFeedRepositoryShape {
  const exec = makeDbExecutor(sqlClient);
  return {
    deleteById: (id) => deleteById(db, exec, id),
    insertFeed: (input) => insertFeed(db, exec, input),
    listAll: () => listAll(db, exec),
    listByMediaId: (mediaId) => listByMediaId(db, exec, mediaId),
    listEnabledRows: () => listEnabledRows(db, exec),
    markLastChecked: (id, lastChecked) => markLastChecked(db, exec, id, lastChecked),
    setEnabled: (id, enabled) => setEnabled(db, exec, id, enabled),
  } satisfies RssFeedRepositoryShape;
}

const listAll = Effect.fn("RssFeedRepository.listAll")(function* (
  db: AppDatabase,
  exec: DbExecutor,
) {
  const rows = yield* exec.runQuery(
    "Failed to list RSS feeds",
    db.select().from(rssFeeds).orderBy(desc(rssFeeds.id)).prepare().effect(),
  );
  return rows.map((row) => toRssFeed(row));
});

const listByMediaId = Effect.fn("RssFeedRepository.listByMediaId")(function* (
  db: AppDatabase,
  exec: DbExecutor,
  mediaId: number,
) {
  const rows = yield* exec.runQuery(
    "Failed to list media RSS feeds",
    db.select().from(rssFeeds).where(eq(rssFeeds.mediaId, mediaId)).prepare().effect(),
  );
  return rows.map((row) => toRssFeed(row));
});

const listEnabledRows = Effect.fn("RssFeedRepository.listEnabledRows")(function* (
  db: AppDatabase,
  exec: DbExecutor,
) {
  return yield* exec.runQuery(
    "Failed to run RSS check",
    db.select().from(rssFeeds).where(eq(rssFeeds.enabled, true)).prepare().effect(),
  );
});

const insertFeed = Effect.fn("RssFeedRepository.insertFeed")(function* (
  db: AppDatabase,
  exec: DbExecutor,
  input: {
    readonly createdAt: string;
    readonly mediaId: number;
    readonly name: string | null;
    readonly url: string;
  },
) {
  const [row] = yield* exec.runQuery(
    "Failed to add RSS feed",
    db
      .insert(rssFeeds)
      .values({
        mediaId: input.mediaId,
        createdAt: input.createdAt,
        enabled: true,
        lastChecked: null,
        name: input.name,
        url: input.url,
      })
      .returning()
      .prepare()
      .effect(),
  );

  if (!row) {
    return yield* new DatabaseError({
      cause: new Error("RSS feed insert returned no rows"),
      message: "Failed to add RSS feed",
    });
  }

  return toRssFeed(row);
});

const deleteById = Effect.fn("RssFeedRepository.deleteById")(function* (
  db: AppDatabase,
  exec: DbExecutor,
  id: number,
) {
  yield* exec.runQuery(
    "Failed to delete RSS feed",
    db.delete(rssFeeds).where(eq(rssFeeds.id, id)).prepare().effect(),
  );
});

const setEnabled = Effect.fn("RssFeedRepository.setEnabled")(function* (
  db: AppDatabase,
  exec: DbExecutor,
  id: number,
  enabled: boolean,
) {
  yield* exec.runQuery(
    "Failed to toggle RSS feed",
    db.update(rssFeeds).set({ enabled }).where(eq(rssFeeds.id, id)).prepare().effect(),
  );
});

const markLastChecked = Effect.fn("RssFeedRepository.markLastChecked")(function* (
  db: AppDatabase,
  exec: DbExecutor,
  id: number,
  lastChecked: string,
) {
  yield* exec.runQuery(
    "Failed to run RSS check",
    db.update(rssFeeds).set({ lastChecked }).where(eq(rssFeeds.id, id)).prepare().effect(),
  );
});
