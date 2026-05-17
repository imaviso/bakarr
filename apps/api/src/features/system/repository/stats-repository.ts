import { and, count, desc, eq, sql, type SQL } from "drizzle-orm";
import { Effect } from "effect";

import type { AppDatabase } from "@/db/database.ts";
import {
  media,
  backgroundJobs,
  downloadEvents,
  downloads,
  mediaUnits,
  rssFeeds,
  systemLogs,
} from "@/db/schema.ts";
import { tryDatabasePromise } from "@/infra/effect/db.ts";
import { buildSystemLogConditions } from "@/features/system/system-log-export.ts";

const countDownloadsWhere = Effect.fn("SystemStatsRepository.countDownloadsWhere")(function* (
  db: AppDatabase,
  condition: SQL,
) {
  const countRows = yield* tryDatabasePromise("Failed to count downloads", () =>
    db.select({ value: count() }).from(downloads).where(condition),
  );
  const countRow = countRows[0];

  if (!countRow) {
    return 0;
  }

  return countRow.value;
});

function requireSingleRow<T>(rows: ReadonlyArray<T>, fallback: T): T {
  return rows[0] ?? fallback;
}

export const countQueuedDownloads = Effect.fn("SystemStatsRepository.countQueuedDownloads")(
  function* (db: AppDatabase) {
    return yield* countDownloadsWhere(db, eq(downloads.status, "queued"));
  },
);

export const countActiveDownloads = Effect.fn("SystemStatsRepository.countActiveDownloads")(
  function* (db: AppDatabase) {
    return yield* countDownloadsWhere(db, sql`${downloads.status} in ('downloading', 'paused')`);
  },
);

export const countFailedDownloads = Effect.fn("SystemStatsRepository.countFailedDownloads")(
  function* (db: AppDatabase) {
    return yield* countDownloadsWhere(db, eq(downloads.status, "error"));
  },
);

export const countImportedDownloads = Effect.fn("SystemStatsRepository.countImportedDownloads")(
  function* (db: AppDatabase) {
    return yield* countDownloadsWhere(db, eq(downloads.status, "imported"));
  },
);

export const countCompletedDownloads = Effect.fn("SystemStatsRepository.countCompletedDownloads")(
  function* (db: AppDatabase) {
    return yield* countDownloadsWhere(db, eq(downloads.status, "completed"));
  },
);

export const countAnimeRows = Effect.fn("SystemStatsRepository.countAnimeRows")(function* (
  db: AppDatabase,
) {
  const countRows = yield* tryDatabasePromise("Failed to count media", () =>
    db.select({ value: count() }).from(media),
  );
  const countRow = requireSingleRow(countRows, { value: 0 });
  return countRow.value;
});

export const countMonitoredAnimeRows = Effect.fn("SystemStatsRepository.countMonitoredAnimeRows")(
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

export const countUpToDateAnimeRows = Effect.fn("SystemStatsRepository.countUpToDateAnimeRows")(
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

export const loadSystemLibraryStatsAggregate = Effect.fn(
  "SystemStatsRepository.loadSystemLibraryStatsAggregate",
)(function* (db: AppDatabase) {
  const [
    totalAnime,
    monitoredAnime,
    totalUnits,
    downloadedUnits,
    totalRssFeeds,
    completedDownloads,
    upToDateAnime,
  ] = yield* Effect.all(
    [
      countAnimeRows(db),
      countMonitoredAnimeRows(db),
      countEpisodeRows(db),
      countDownloadedEpisodeRows(db),
      countRssFeedRows(db),
      countCompletedDownloads(db),
      countUpToDateAnimeRows(db),
    ],
    { concurrency: "unbounded" },
  );

  return {
    completedDownloads,
    downloadedUnits,
    monitoredAnime,
    totalAnime,
    totalUnits,
    totalRssFeeds,
    upToDateAnime,
  } as const;
});

export const loadSystemDownloadStatsAggregate = Effect.fn(
  "SystemStatsRepository.loadSystemDownloadStatsAggregate",
)(function* (db: AppDatabase) {
  const [queuedDownloads, activeDownloads, failedDownloads, importedDownloads] = yield* Effect.all(
    [
      countQueuedDownloads(db),
      countActiveDownloads(db),
      countFailedDownloads(db),
      countImportedDownloads(db),
    ],
    { concurrency: "unbounded" },
  );

  return {
    activeDownloads,
    failedDownloads,
    importedDownloads,
    queuedDownloads,
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

export const listRecentDownloadEventRows = Effect.fn(
  "SystemStatsRepository.listRecentDownloadEventRows",
)(function* (db: AppDatabase, limit: number) {
  return yield* tryDatabasePromise("Failed to list download events", () =>
    db.select().from(downloadEvents).orderBy(desc(downloadEvents.id)).limit(limit),
  );
});

export const loadSystemLogPage = Effect.fn("SystemStatsRepository.loadSystemLogPage")(function* (
  db: AppDatabase,
  input: {
    endDate?: string;
    eventType?: string;
    level?: string;
    page: number;
    pageSize: number;
    startDate?: string;
  },
) {
  const conditions = buildSystemLogConditions(input);
  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
  const countQuery = db.select({ value: count() }).from(systemLogs);
  const rowsQuery = db
    .select()
    .from(systemLogs)
    .orderBy(desc(systemLogs.id))
    .limit(input.pageSize)
    .offset((input.page - 1) * input.pageSize);

  const totalRows = yield* tryDatabasePromise("Failed to load system logs", () =>
    whereClause ? countQuery.where(whereClause) : countQuery,
  );
  const total = requireSingleRow(totalRows, { value: 0 }).value;
  const rows = yield* tryDatabasePromise("Failed to load system logs", () =>
    whereClause ? rowsQuery.where(whereClause) : rowsQuery,
  );

  return { rows, total };
});
