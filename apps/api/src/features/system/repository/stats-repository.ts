import { and, count, desc, eq, sql } from "drizzle-orm";
import * as NodeSqliteClient from "@effect/sql-sqlite-node/SqliteClient";

import { AppDrizzleDatabase, type AppDatabase } from "@/db/database.ts";
import { media, backgroundJobs, downloads, mediaUnits, rssFeeds, systemLogs } from "@/db/schema.ts";
import { makeDbExecutor, type DbExecutor } from "@/infra/effect/db.ts";
import { Context, Effect, Layer } from "effect";

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

export class SystemStatsRepository extends Context.Service<
  SystemStatsRepository,
  SystemStatsRepositoryShape
>()("@bakarr/api/SystemStatsRepository") {
  static readonly layer = Layer.effect(
    SystemStatsRepository,
    Effect.gen(function* () {
      const db = yield* AppDrizzleDatabase;
      const sqlClient = yield* NodeSqliteClient.SqliteClient;
      return makeSystemStatsRepositoryShape(db, sqlClient);
    }),
  );
}

export const countMediaRows = Effect.fn("SystemStatsRepository.countMediaRows")(function* (
  db: AppDatabase,
  exec: DbExecutor,
) {
  const countRows = yield* exec.runQuery(
    "Failed to count media",
    db.select({ value: count() }).from(media).prepare().effect(),
  );
  const countRow = requireSingleRow(countRows, { value: 0 });
  return countRow.value;
});

export const countMonitoredMediaRows = Effect.fn("SystemStatsRepository.countMonitoredMediaRows")(
  function* (db: AppDatabase, exec: DbExecutor) {
    const countRows = yield* exec.runQuery(
      "Failed to count media",
      db.select({ value: count() }).from(media).where(eq(media.monitored, true)).prepare().effect(),
    );
    const countRow = requireSingleRow(countRows, { value: 0 });
    return countRow.value;
  },
);

export const countEpisodeRows = Effect.fn("SystemStatsRepository.countEpisodeRows")(function* (
  db: AppDatabase,
  exec: DbExecutor,
) {
  const countRows = yield* exec.runQuery(
    "Failed to count mediaUnits",
    db.select({ value: count() }).from(mediaUnits).prepare().effect(),
  );
  const countRow = requireSingleRow(countRows, { value: 0 });
  return countRow.value;
});

export const countDownloadedEpisodeRows = Effect.fn(
  "SystemStatsRepository.countDownloadedEpisodeRows",
)(function* (db: AppDatabase, exec: DbExecutor) {
  const countRows = yield* exec.runQuery(
    "Failed to count mediaUnits",
    db
      .select({ value: count() })
      .from(mediaUnits)
      .where(eq(mediaUnits.downloaded, true))
      .prepare()
      .effect(),
  );
  const countRow = requireSingleRow(countRows, { value: 0 });
  return countRow.value;
});

export const countUpToDateMediaRows = Effect.fn("SystemStatsRepository.countUpToDateMediaRows")(
  function* (db: AppDatabase, exec: DbExecutor) {
    const rows = yield* exec.runQuery(
      "Failed to count up-to-date media",
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
        .groupBy(media.id, media.unitCount)
        .prepare()
        .effect(),
    );

    return rows.filter((row) => row.unitCount !== null && row.downloadedCount === row.unitCount)
      .length;
  },
);

export const countRssFeedRows = Effect.fn("SystemStatsRepository.countRssFeedRows")(function* (
  db: AppDatabase,
  exec: DbExecutor,
) {
  const countRows = yield* exec.runQuery(
    "Failed to count RSS feeds",
    db.select({ value: count() }).from(rssFeeds).prepare().effect(),
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
)(function* (db: AppDatabase, exec: DbExecutor) {
  const row = yield* exec.runQuery(
    "Failed to load system library stats",
    db.effectGet<SystemLibraryStatsAggregateRow>(sql`
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

  const stats: SystemLibraryStatsAggregateRow = {
    completedDownloads: row?.completedDownloads ?? 0,
    downloadedUnits: row?.downloadedUnits ?? 0,
    monitoredAnime: row?.monitoredAnime ?? 0,
    totalAnime: row?.totalAnime ?? 0,
    totalRssFeeds: row?.totalRssFeeds ?? 0,
    totalUnits: row?.totalUnits ?? 0,
    upToDateAnime: row?.upToDateAnime ?? 0,
  };
  return stats;
});

export const listBackgroundJobRows = Effect.fn("SystemStatsRepository.listBackgroundJobRows")(
  function* (db: AppDatabase, exec: DbExecutor) {
    return yield* exec.runQuery(
      "Failed to list background jobs",
      db.select().from(backgroundJobs).orderBy(backgroundJobs.name).prepare().effect(),
    );
  },
);

export const listRecentSystemLogRows = Effect.fn("SystemStatsRepository.listRecentSystemLogRows")(
  function* (db: AppDatabase, exec: DbExecutor, limit: number) {
    return yield* exec.runQuery(
      "Failed to list system logs",
      db.select().from(systemLogs).orderBy(desc(systemLogs.id)).limit(limit).prepare().effect(),
    );
  },
);

export function makeSystemStatsRepositoryShape(
  db: AppDatabase,
  sqlClient: NodeSqliteClient.SqliteClient,
): SystemStatsRepositoryShape {
  const exec = makeDbExecutor(sqlClient);
  return {
    listBackgroundJobRows: () => listBackgroundJobRows(db, exec),
    listRecentSystemLogRows: (limit) => listRecentSystemLogRows(db, exec, limit),
    loadSystemLibraryStatsAggregate: () => loadSystemLibraryStatsAggregate(db, exec),
  } satisfies SystemStatsRepositoryShape;
}

/** Dashboard read-model alias — prefer SystemDashboardRepository naming for new code. */
export const SystemDashboardRepository = SystemStatsRepository;
export type SystemDashboardRepositoryShape = SystemStatsRepositoryShape;
export const makeSystemDashboardRepositoryShape = makeSystemStatsRepositoryShape;
