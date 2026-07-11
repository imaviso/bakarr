import { desc, eq } from "drizzle-orm";
import { Effect } from "effect";

import type { RssFeed } from "@packages/shared/index.ts";
import { AppDrizzleDatabase, DatabaseError, type AppDatabase } from "@/db/database.ts";
import { rssFeeds } from "@/db/schema.ts";
import { toRssFeed } from "@/features/operations/repository/rss-repository.ts";
import { tryDatabasePromise } from "@/infra/effect/db.ts";

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

export class RssFeedRepository extends Effect.Service<RssFeedRepository>()(
  "@bakarr/api/RssFeedRepository",
  {
    effect: Effect.gen(function* () {
      const db = yield* AppDrizzleDatabase;
      return makeRssFeedRepositoryShape(db);
    }),
    dependencies: [AppDrizzleDatabase.Default],
  },
) {}

function makeRssFeedRepositoryShape(db: AppDatabase): RssFeedRepositoryShape {
  return {
    deleteById: (id) => deleteById(db, id),
    insertFeed: (input) => insertFeed(db, input),
    listAll: () => listAll(db),
    listByMediaId: (mediaId) => listByMediaId(db, mediaId),
    listEnabledRows: () => listEnabledRows(db),
    markLastChecked: (id, lastChecked) => markLastChecked(db, id, lastChecked),
    setEnabled: (id, enabled) => setEnabled(db, id, enabled),
  } satisfies RssFeedRepositoryShape;
}

export function makeRssFeedRepository(db: AppDatabase): RssFeedRepository {
  return RssFeedRepository.make(makeRssFeedRepositoryShape(db));
}

const listAll = Effect.fn("RssFeedRepository.listAll")(function* (db: AppDatabase) {
  const rows = yield* tryDatabasePromise("Failed to list RSS feeds", () =>
    db.select().from(rssFeeds).orderBy(desc(rssFeeds.id)),
  );
  return rows.map(toRssFeed);
});

const listByMediaId = Effect.fn("RssFeedRepository.listByMediaId")(function* (
  db: AppDatabase,
  mediaId: number,
) {
  const rows = yield* tryDatabasePromise("Failed to list media RSS feeds", () =>
    db.select().from(rssFeeds).where(eq(rssFeeds.mediaId, mediaId)),
  );
  return rows.map(toRssFeed);
});

const listEnabledRows = Effect.fn("RssFeedRepository.listEnabledRows")(function* (db: AppDatabase) {
  return yield* tryDatabasePromise("Failed to run RSS check", () =>
    db.select().from(rssFeeds).where(eq(rssFeeds.enabled, true)),
  );
});

const insertFeed = Effect.fn("RssFeedRepository.insertFeed")(function* (
  db: AppDatabase,
  input: {
    readonly createdAt: string;
    readonly mediaId: number;
    readonly name: string | null;
    readonly url: string;
  },
) {
  const [row] = yield* tryDatabasePromise("Failed to add RSS feed", () =>
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
      .returning(),
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
  id: number,
) {
  yield* tryDatabasePromise("Failed to delete RSS feed", () =>
    db.delete(rssFeeds).where(eq(rssFeeds.id, id)),
  );
});

const setEnabled = Effect.fn("RssFeedRepository.setEnabled")(function* (
  db: AppDatabase,
  id: number,
  enabled: boolean,
) {
  yield* tryDatabasePromise("Failed to toggle RSS feed", () =>
    db.update(rssFeeds).set({ enabled }).where(eq(rssFeeds.id, id)),
  );
});

const markLastChecked = Effect.fn("RssFeedRepository.markLastChecked")(function* (
  db: AppDatabase,
  id: number,
  lastChecked: string,
) {
  yield* tryDatabasePromise("Failed to run RSS check", () =>
    db.update(rssFeeds).set({ lastChecked }).where(eq(rssFeeds.id, id)),
  );
});
