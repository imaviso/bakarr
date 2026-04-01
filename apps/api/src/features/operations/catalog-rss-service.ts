import { Context, Effect, Layer } from "effect";
import { desc, eq } from "drizzle-orm";
import type { RssFeed } from "@packages/shared/index.ts";

import { Database, type DatabaseError } from "@/db/database.ts";
import { ClockService, nowIsoFromClock } from "@/lib/clock.ts";
import type { OperationsError } from "@/features/operations/errors.ts";
import { requireAnime } from "@/features/operations/repository/anime-repository.ts";
import { toRssFeed } from "@/features/operations/repository/rss-repository.ts";
import { appendLog } from "@/features/operations/job-support.ts";
import { rssFeeds } from "@/db/schema.ts";
import { tryDatabasePromise } from "@/lib/effect-db.ts";

export interface CatalogRssServiceShape {
  readonly listRssFeeds: () => Effect.Effect<RssFeed[], DatabaseError>;
  readonly listAnimeRssFeeds: (animeId: number) => Effect.Effect<RssFeed[], DatabaseError>;
  readonly addRssFeed: (input: {
    anime_id: number;
    url: string;
    name?: string;
  }) => Effect.Effect<RssFeed, OperationsError | DatabaseError>;
  readonly deleteRssFeed: (id: number) => Effect.Effect<void, DatabaseError>;
  readonly toggleRssFeed: (id: number, enabled: boolean) => Effect.Effect<void, DatabaseError>;
}

export class CatalogRssService extends Context.Tag("@bakarr/api/CatalogRssService")<
  CatalogRssService,
  CatalogRssServiceShape
>() {}

export const CatalogRssServiceLive = Layer.effect(
  CatalogRssService,
  Effect.gen(function* () {
    const { db } = yield* Database;
    const clock = yield* ClockService;
    const nowIso = () => nowIsoFromClock(clock);

    const listRssFeeds = Effect.fn("OperationsService.listRssFeeds")(function* () {
      const rows = yield* tryDatabasePromise("Failed to list RSS feeds", () =>
        db.select().from(rssFeeds).orderBy(desc(rssFeeds.id)),
      );

      return rows.map(toRssFeed) as RssFeed[];
    });

    const listAnimeRssFeeds = Effect.fn("OperationsService.listAnimeRssFeeds")(function* (
      animeId: number,
    ) {
      const rows = yield* tryDatabasePromise("Failed to list anime RSS feeds", () =>
        db.select().from(rssFeeds).where(eq(rssFeeds.animeId, animeId)),
      );

      return rows.map(toRssFeed) as RssFeed[];
    });

    const addRssFeed = Effect.fn("OperationsService.addRssFeed")(function* (rssInput: {
      anime_id: number;
      url: string;
      name?: string;
    }) {
      yield* requireAnime(db, rssInput.anime_id);
      const now = yield* nowIso();
      const [row] = yield* tryDatabasePromise("Failed to add RSS feed", () =>
        db
          .insert(rssFeeds)
          .values({
            animeId: rssInput.anime_id,
            createdAt: now,
            enabled: true,
            lastChecked: null,
            name: rssInput.name ?? null,
            url: rssInput.url,
          })
          .returning(),
      );

      yield* appendLog(
        db,
        "rss.created",
        "success",
        `RSS feed added for anime ${rssInput.anime_id}`,
        nowIso,
      );

      return toRssFeed(row);
    });

    const deleteRssFeed = Effect.fn("OperationsService.deleteRssFeed")(function* (id: number) {
      yield* tryDatabasePromise("Failed to delete RSS feed", () =>
        db.delete(rssFeeds).where(eq(rssFeeds.id, id)),
      );
    });

    const toggleRssFeed = Effect.fn("OperationsService.toggleRssFeed")(function* (
      id: number,
      enabled: boolean,
    ) {
      yield* tryDatabasePromise("Failed to toggle RSS feed", () =>
        db.update(rssFeeds).set({ enabled }).where(eq(rssFeeds.id, id)),
      );
    });

    return CatalogRssService.of({
      addRssFeed,
      deleteRssFeed,
      listAnimeRssFeeds,
      listRssFeeds,
      toggleRssFeed,
    });
  }),
);
