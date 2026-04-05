import { and, count, desc, eq, sql, type SQL } from "drizzle-orm";
import { Effect } from "effect";

import type { AppDatabase } from "@/db/database.ts";
import {
  anime,
  backgroundJobs,
  downloadEvents,
  downloads,
  episodes,
  rssFeeds,
  systemLogs,
} from "@/db/schema.ts";
import { tryDatabasePromise } from "@/lib/effect-db.ts";
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
  const countRows = yield* tryDatabasePromise("Failed to count anime", () =>
    db.select({ value: count() }).from(anime),
  );
  const countRow = requireSingleRow(countRows, { value: 0 });
  return countRow.value;
});

export const countMonitoredAnimeRows = Effect.fn("SystemStatsRepository.countMonitoredAnimeRows")(
  function* (db: AppDatabase) {
    const countRows = yield* tryDatabasePromise("Failed to count anime", () =>
      db.select({ value: count() }).from(anime).where(eq(anime.monitored, true)),
    );
    const countRow = requireSingleRow(countRows, { value: 0 });
    return countRow.value;
  },
);

export const countEpisodeRows = Effect.fn("SystemStatsRepository.countEpisodeRows")(function* (
  db: AppDatabase,
) {
  const countRows = yield* tryDatabasePromise("Failed to count episodes", () =>
    db.select({ value: count() }).from(episodes),
  );
  const countRow = requireSingleRow(countRows, { value: 0 });
  return countRow.value;
});

export const countDownloadedEpisodeRows = Effect.fn(
  "SystemStatsRepository.countDownloadedEpisodeRows",
)(function* (db: AppDatabase) {
  const countRows = yield* tryDatabasePromise("Failed to count episodes", () =>
    db.select({ value: count() }).from(episodes).where(eq(episodes.downloaded, true)),
  );
  const countRow = requireSingleRow(countRows, { value: 0 });
  return countRow.value;
});

export const countUpToDateAnimeRows = Effect.fn("SystemStatsRepository.countUpToDateAnimeRows")(
  function* (db: AppDatabase) {
    const rows = yield* tryDatabasePromise("Failed to count up-to-date anime", () =>
      db
        .select({
          downloadedCount: sql<number>`coalesce(sum(case when ${episodes.downloaded} and ${episodes.number} <= ${anime.episodeCount} then 1 else 0 end), 0)`,
          episodeCount: anime.episodeCount,
        })
        .from(anime)
        .leftJoin(episodes, eq(episodes.animeId, anime.id))
        .where(
          and(
            eq(anime.monitored, true),
            sql`${anime.episodeCount} is not null`,
            sql`${anime.episodeCount} > 0`,
          ),
        )
        .groupBy(anime.id, anime.episodeCount),
    );

    return rows.filter(
      (row) => row.episodeCount !== null && Number(row.downloadedCount) === row.episodeCount,
    ).length;
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
  const totalAnimeRows = yield* tryDatabasePromise("Failed to count anime", () =>
    db.select({ totalAnime: count() }).from(anime),
  );
  const monitoredAnimeRows = yield* tryDatabasePromise("Failed to count monitored anime", () =>
    db.select({ monitoredAnime: count() }).from(anime).where(eq(anime.monitored, true)),
  );
  const totalEpisodesRows = yield* tryDatabasePromise("Failed to count episodes", () =>
    db.select({ totalEpisodes: count() }).from(episodes),
  );
  const downloadedEpisodesRows = yield* tryDatabasePromise(
    "Failed to count downloaded episodes",
    () =>
      db
        .select({ downloadedEpisodes: count() })
        .from(episodes)
        .where(eq(episodes.downloaded, true)),
  );
  const totalRssFeedsRows = yield* tryDatabasePromise("Failed to count RSS feeds", () =>
    db.select({ totalRssFeeds: count() }).from(rssFeeds),
  );
  const completedDownloadsRows = yield* tryDatabasePromise(
    "Failed to count completed downloads",
    () =>
      db
        .select({ completedDownloads: count() })
        .from(downloads)
        .where(eq(downloads.status, "completed")),
  );
  const totalAnime = requireSingleRow(totalAnimeRows, { totalAnime: 0 }).totalAnime;
  const monitoredAnime = requireSingleRow(monitoredAnimeRows, { monitoredAnime: 0 }).monitoredAnime;
  const totalEpisodes = requireSingleRow(totalEpisodesRows, { totalEpisodes: 0 }).totalEpisodes;
  const downloadedEpisodes = requireSingleRow(downloadedEpisodesRows, {
    downloadedEpisodes: 0,
  }).downloadedEpisodes;
  const totalRssFeeds = requireSingleRow(totalRssFeedsRows, { totalRssFeeds: 0 }).totalRssFeeds;
  const completedDownloads = requireSingleRow(completedDownloadsRows, {
    completedDownloads: 0,
  }).completedDownloads;

  const upToDateAnime = yield* countUpToDateAnimeRows(db);

  return {
    completedDownloads,
    downloadedEpisodes,
    monitoredAnime,
    totalAnime,
    totalEpisodes,
    totalRssFeeds,
    upToDateAnime,
  } as const;
});

export const loadSystemDownloadStatsAggregate = Effect.fn(
  "SystemStatsRepository.loadSystemDownloadStatsAggregate",
)(function* (db: AppDatabase) {
  const queuedDownloadsRows = yield* tryDatabasePromise("Failed to count queued downloads", () =>
    db.select({ queuedDownloads: count() }).from(downloads).where(eq(downloads.status, "queued")),
  );
  const activeDownloadsRows = yield* tryDatabasePromise("Failed to count active downloads", () =>
    db
      .select({ activeDownloads: count() })
      .from(downloads)
      .where(sql`${downloads.status} in ('downloading', 'paused')`),
  );
  const failedDownloadsRows = yield* tryDatabasePromise("Failed to count failed downloads", () =>
    db.select({ failedDownloads: count() }).from(downloads).where(eq(downloads.status, "error")),
  );
  const importedDownloadsRows = yield* tryDatabasePromise(
    "Failed to count imported downloads",
    () =>
      db
        .select({ importedDownloads: count() })
        .from(downloads)
        .where(eq(downloads.status, "imported")),
  );

  const queuedDownloads = requireSingleRow(queuedDownloadsRows, {
    queuedDownloads: 0,
  }).queuedDownloads;
  const activeDownloads = requireSingleRow(activeDownloadsRows, {
    activeDownloads: 0,
  }).activeDownloads;
  const failedDownloads = requireSingleRow(failedDownloadsRows, {
    failedDownloads: 0,
  }).failedDownloads;
  const importedDownloads = requireSingleRow(importedDownloadsRows, {
    importedDownloads: 0,
  }).importedDownloads;

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
