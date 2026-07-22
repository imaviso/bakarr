import { and, count, desc, eq, sql } from "drizzle-orm";
import { Effect } from "effect";

import { AppDrizzleDatabase, type AppDatabase } from "@/db/database.ts";
import { media, backgroundJobs, downloads, mediaUnits, rssFeeds, systemLogs } from "@/db/schema.ts";
import { tryDatabasePromise } from "@/infra/effect/db.ts";

function requireSingleRow<T>(rows: ReadonlyArray<T>, fallback: T): T {
  return rows[0] ?? fallback;
}

export interface SystemStatsRepositoryShape {
  readonly listBackgroundJobRows: () => ReturnType<typeof listBackgroundJobRows>;
  readonly listRecentSystemLogRows: (limit: number) => ReturnType<typeof listRecentSystemLogRows>;
  readonly loadSystemLibraryStatsAggregate: () => ReturnType<
    typeof loadSystemLibraryStatsAggregate
  >;
}

export class SystemStatsRepository extends Effect.Service<SystemStatsRepository>()(
  "@bakarr/api/SystemStatsRepository",
  {
    effect: Effect.gen(function* () {
      const db = yield* AppDrizzleDatabase;
      return makeSystemStatsRepositoryShape(db);
    }),
    dependencies: [AppDrizzleDatabase.Default],
  },
) {}

export const countMediaRows = Effect.fn("SystemStatsRepository.countMediaRows")(function* (
  db: AppDatabase,
) {
  const countRows = yield* tryDatabasePromise("Failed to count media", () =>
    db.select({ value: count() }).from(media),
  );
  const countRow = requireSingleRow(countRows, { value: 0 });
  return countRow.value;
});

export const countMonitoredMediaRows = Effect.fn("SystemStatsRepository.countMonitoredMediaRows")(
  function* (db: AppDatabase) {
    const countRows = yield* tryDatabasePromise("Failed to count media", () =>
      db.select({ value: count() }).from(media).where(eq(media.monitored, true)),
    );
    const countRow = requireSingleRow(countRows, { value: 0 });
    return countRow.value;
  },
);

export const countEpisodeRows = Effect.fn("SystemStatsRepository.countEpisodeRows")(function* (
  db: AppDatabase,
) {
  const countRows = yield* tryDatabasePromise("Failed to count mediaUnits", () =>
    db.select({ value: count() }).from(mediaUnits),
  );
  const countRow = requireSingleRow(countRows, { value: 0 });
  return countRow.value;
});

export const countDownloadedEpisodeRows = Effect.fn(
  "SystemStatsRepository.countDownloadedEpisodeRows",
)(function* (db: AppDatabase) {
  const countRows = yield* tryDatabasePromise("Failed to count mediaUnits", () =>
    db.select({ value: count() }).from(mediaUnits).where(eq(mediaUnits.downloaded, true)),
  );
  const countRow = requireSingleRow(countRows, { value: 0 });
  return countRow.value;
});

export const countUpToDateMediaRows = Effect.fn("SystemStatsRepository.countUpToDateMediaRows")(
  function* (db: AppDatabase) {
    const rows = yield* tryDatabasePromise("Failed to count up-to-date media", () =>
      db
        .select({
          downloadedCount: sql<number>`coalesce(sum(case when ${mediaUnits.downloaded} and ${mediaUnits.number} <= ${media.unitCount} then 1 else 0 end), 0)`,
          unitCount: media.unitCount,
        })
        .from(media)
        .leftJoin(mediaUnits, eq(mediaUnits.mediaId, media.id))
        .where(
          and(
            eq(media.monitored, true),
            sql`${media.unitCount} is not null`,
            sql`${media.unitCount} > 0`,
          ),
        )
        .groupBy(media.id, media.unitCount),
    );

    return rows.filter((row) => row.unitCount !== null && row.downloadedCount === row.unitCount)
      .length;
  },
);

export const countRssFeedRows = Effect.fn("SystemStatsRepository.countRssFeedRows")(function* (
  db: AppDatabase,
) {
  const countRows = yield* tryDatabasePromise("Failed to count RSS feeds", () =>
    db.select({ value: count() }).from(rssFeeds),
  );
  const countRow = requireSingleRow(countRows, { value: 0 });
  return countRow.value;
});

interface SystemLibraryStatsAggregateRow {
  readonly completedDownloads: number;
  readonly downloadedUnits: number;
  readonly monitoredAnime: number;
  readonly totalAnime: number;
  readonly totalRssFeeds: number;
  readonly totalUnits: number;
  readonly upToDateAnime: number;
}

export const loadSystemLibraryStatsAggregate = Effect.fn(
  "SystemStatsRepository.loadSystemLibraryStatsAggregate",
)(function* (db: AppDatabase) {
  const row = yield* tryDatabasePromise("Failed to load system library stats", () =>
    db.get<SystemLibraryStatsAggregateRow>(sql`
      select
        (select count(*) from ${media}) as totalAnime,
        (select count(*) from ${media} where ${media.monitored} = 1) as monitoredAnime,
        (select count(*) from ${mediaUnits}) as totalUnits,
        (select count(*) from ${mediaUnits} where ${mediaUnits.downloaded} = 1) as downloadedUnits,
        (select count(*) from ${rssFeeds}) as totalRssFeeds,
        (select count(*) from ${downloads} where ${downloads.status} = 'completed') as completedDownloads,
        (
          select count(*)
          from (
            select ${media.id}
            from ${media}
            left join ${mediaUnits} on ${mediaUnits.mediaId} = ${media.id}
            where ${media.monitored} = 1
              and ${media.unitCount} is not null
              and ${media.unitCount} > 0
            group by ${media.id}, ${media.unitCount}
            having coalesce(sum(case when ${mediaUnits.downloaded} = 1 and ${mediaUnits.number} <= ${media.unitCount} then 1 else 0 end), 0) = ${media.unitCount}
          )
        ) as upToDateAnime
    `),
  );

  return {
    completedDownloads: row?.completedDownloads ?? 0,
    downloadedUnits: row?.downloadedUnits ?? 0,
    monitoredAnime: row?.monitoredAnime ?? 0,
    totalAnime: row?.totalAnime ?? 0,
    totalRssFeeds: row?.totalRssFeeds ?? 0,
    totalUnits: row?.totalUnits ?? 0,
    upToDateAnime: row?.upToDateAnime ?? 0,
  } as const;
});

export const listBackgroundJobRows = Effect.fn("SystemStatsRepository.listBackgroundJobRows")(
  function* (db: AppDatabase) {
    return yield* tryDatabasePromise("Failed to list background jobs", () =>
      db.select().from(backgroundJobs).orderBy(backgroundJobs.name),
    );
  },
);

export const listRecentSystemLogRows = Effect.fn("SystemStatsRepository.listRecentSystemLogRows")(
  function* (db: AppDatabase, limit: number) {
    return yield* tryDatabasePromise("Failed to list system logs", () =>
      db.select().from(systemLogs).orderBy(desc(systemLogs.id)).limit(limit),
    );
  },
);

function makeSystemStatsRepositoryShape(db: AppDatabase): SystemStatsRepositoryShape {
  return {
    listBackgroundJobRows: () => listBackgroundJobRows(db),
    listRecentSystemLogRows: (limit) => listRecentSystemLogRows(db, limit),
    loadSystemLibraryStatsAggregate: () => loadSystemLibraryStatsAggregate(db),
  } satisfies SystemStatsRepositoryShape;
}

export function makeSystemStatsRepository(db: AppDatabase): SystemStatsRepository {
  return SystemStatsRepository.make(makeSystemStatsRepositoryShape(db));
}
