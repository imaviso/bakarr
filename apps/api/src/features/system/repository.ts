import { and, count, desc, eq, notInArray, sql } from "drizzle-orm";
import { Effect, Schema } from "effect";

import {
  AnimeSearchResultSchema,
  type UnmappedFolder,
} from "../../../../../packages/shared/src/index.ts";

import type { AppDatabase } from "../../db/database.ts";
import {
  anime,
  appConfig,
  backgroundJobs,
  downloadEvents,
  downloads,
  episodes,
  qualityProfiles,
  releaseProfiles,
  rssFeeds,
  systemLogs,
  unmappedFolderMatches,
} from "../../db/schema.ts";
import { tryDatabasePromise } from "../../lib/effect-db.ts";
import { buildUnmappedFolderSearchQueries } from "../operations/unmapped-folders.ts";
import { StoredUnmappedFolderCorruptError } from "./errors.ts";
import { eventTypeCondition } from "./support.ts";

export type QualityProfileRow = typeof qualityProfiles.$inferSelect;
export type QualityProfileInsert = typeof qualityProfiles.$inferInsert;
export type ReleaseProfileRow = typeof releaseProfiles.$inferSelect;
export type ReleaseProfileInsert = typeof releaseProfiles.$inferInsert;

const AnimeSearchResultListJsonSchema = Schema.parseJson(Schema.Array(AnimeSearchResultSchema));
const encodeAnimeSearchResultList = Schema.encodeSync(AnimeSearchResultListJsonSchema);
const decodeAnimeSearchResultList = Schema.decodeUnknown(AnimeSearchResultListJsonSchema);

export const loadSystemConfigRow = Effect.fn("SystemRepository.loadSystemConfigRow")(function* (
  db: AppDatabase,
) {
  const rows = yield* tryDatabasePromise("Failed to load system config", () =>
    db.select().from(appConfig).where(eq(appConfig.id, 1)).limit(1),
  );
  return rows[0];
});

export const insertSystemConfigRow = Effect.fn("SystemRepository.insertSystemConfigRow")(function* (
  db: AppDatabase,
  input: typeof appConfig.$inferInsert,
) {
  yield* tryDatabasePromise("Failed to insert system config", () =>
    db.insert(appConfig).values(input),
  );
});

export const upsertSystemConfigRow = Effect.fn("SystemRepository.upsertSystemConfigRow")(function* (
  db: AppDatabase,
  input: typeof appConfig.$inferInsert,
) {
  yield* tryDatabasePromise("Failed to upsert system config", () =>
    db
      .insert(appConfig)
      .values(input)
      .onConflictDoUpdate({
        target: appConfig.id,
        set: { data: input.data, updatedAt: input.updatedAt },
      }),
  );
});

export const updateSystemConfigAtomic = Effect.fn("SystemRepository.updateSystemConfigAtomic")(
  function* (
    db: AppDatabase,
    coreInput: typeof appConfig.$inferInsert,
    profileRows: readonly QualityProfileInsert[],
  ) {
    yield* tryDatabasePromise("Failed to update system config", () =>
      db.transaction(async (tx) => {
        await tx
          .insert(appConfig)
          .values(coreInput)
          .onConflictDoUpdate({
            target: appConfig.id,
            set: { data: coreInput.data, updatedAt: coreInput.updatedAt },
          });

        await tx.delete(qualityProfiles);

        if (profileRows.length > 0) {
          await tx.insert(qualityProfiles).values([...profileRows]);
        }
      }),
    );
  },
);

export const loadAnyQualityProfileRow = Effect.fn("SystemRepository.loadAnyQualityProfileRow")(
  function* (db: AppDatabase) {
    const rows = yield* tryDatabasePromise("Failed to load quality profile", () =>
      db.select().from(qualityProfiles).limit(1),
    );
    return rows[0];
  },
);

export const listQualityProfileRows = Effect.fn("SystemRepository.listQualityProfileRows")(
  function* (db: AppDatabase) {
    return yield* tryDatabasePromise("Failed to list quality profiles", () =>
      db.select().from(qualityProfiles).orderBy(qualityProfiles.name),
    );
  },
);

export const insertQualityProfileRow = Effect.fn("SystemRepository.insertQualityProfileRow")(
  function* (db: AppDatabase, row: QualityProfileInsert) {
    yield* tryDatabasePromise("Failed to insert quality profile", () =>
      db.insert(qualityProfiles).values(row),
    );
  },
);

export const insertQualityProfileRows = Effect.fn("SystemRepository.insertQualityProfileRows")(
  function* (db: AppDatabase, rows: readonly QualityProfileInsert[]) {
    if (rows.length === 0) {
      return;
    }
    yield* tryDatabasePromise("Failed to insert quality profiles", () =>
      db.insert(qualityProfiles).values([...rows]),
    );
  },
);

export const loadQualityProfileRow = Effect.fn("SystemRepository.loadQualityProfileRow")(function* (
  db: AppDatabase,
  name: string,
) {
  const rows = yield* tryDatabasePromise("Failed to load quality profile", () =>
    db.select().from(qualityProfiles).where(eq(qualityProfiles.name, name)).limit(1),
  );
  return rows[0];
});

export const updateQualityProfileRow = Effect.fn("SystemRepository.updateQualityProfileRow")(
  function* (db: AppDatabase, name: string, row: QualityProfileInsert) {
    yield* tryDatabasePromise("Failed to update quality profile", () =>
      db.update(qualityProfiles).set(row).where(eq(qualityProfiles.name, name)),
    );
  },
);

export const renameQualityProfileWithCascade = Effect.fn(
  "SystemRepository.renameQualityProfileWithCascade",
)(function* (db: AppDatabase, oldName: string, row: QualityProfileInsert) {
  yield* tryDatabasePromise("Failed to rename quality profile", () =>
    db.transaction(async (tx) => {
      await tx.update(qualityProfiles).set(row).where(eq(qualityProfiles.name, oldName));

      if (oldName !== row.name) {
        await tx.update(anime).set({ profileName: row.name }).where(eq(anime.profileName, oldName));
      }
    }),
  );
});

export const deleteQualityProfileRow = Effect.fn("SystemRepository.deleteQualityProfileRow")(
  function* (db: AppDatabase, name: string) {
    yield* tryDatabasePromise("Failed to delete quality profile", () =>
      db.delete(qualityProfiles).where(eq(qualityProfiles.name, name)),
    );
  },
);

export const replaceQualityProfileRows = Effect.fn("SystemRepository.replaceQualityProfileRows")(
  function* (db: AppDatabase, rows: readonly QualityProfileInsert[]) {
    yield* tryDatabasePromise("Failed to replace quality profiles", () =>
      db.transaction(async (tx) => {
        await tx.delete(qualityProfiles);

        if (rows.length === 0) {
          return;
        }

        await tx.insert(qualityProfiles).values([...rows]);
      }),
    );
  },
);

export const listReleaseProfileRows = Effect.fn("SystemRepository.listReleaseProfileRows")(
  function* (db: AppDatabase) {
    return yield* tryDatabasePromise("Failed to list release profiles", () =>
      db.select().from(releaseProfiles).orderBy(releaseProfiles.id),
    );
  },
);

export const insertReleaseProfileRow = Effect.fn("SystemRepository.insertReleaseProfileRow")(
  function* (db: AppDatabase, row: ReleaseProfileInsert) {
    const rows = yield* tryDatabasePromise("Failed to insert release profile", () =>
      db.insert(releaseProfiles).values(row).returning(),
    );
    return rows[0] as ReleaseProfileRow;
  },
);

export const updateReleaseProfileRow = Effect.fn("SystemRepository.updateReleaseProfileRow")(
  function* (db: AppDatabase, id: number, row: Partial<ReleaseProfileInsert>) {
    yield* tryDatabasePromise("Failed to update release profile", () =>
      db.update(releaseProfiles).set(row).where(eq(releaseProfiles.id, id)),
    );
  },
);

export const deleteReleaseProfileRow = Effect.fn("SystemRepository.deleteReleaseProfileRow")(
  function* (db: AppDatabase, id: number) {
    yield* tryDatabasePromise("Failed to delete release profile", () =>
      db.delete(releaseProfiles).where(eq(releaseProfiles.id, id)),
    );
  },
);

export const countQueuedOrDownloadingDownloads = Effect.fn(
  "SystemRepository.countQueuedOrDownloadingDownloads",
)(function* (db: AppDatabase) {
  const [{ value }] = yield* tryDatabasePromise("Failed to count downloads", () =>
    db
      .select({ value: count() })
      .from(downloads)
      .where(sql`${downloads.status} in ('queued', 'downloading')`),
  );
  return value;
});

export const countQueuedDownloads = Effect.fn("SystemRepository.countQueuedDownloads")(function* (
  db: AppDatabase,
) {
  const [{ value }] = yield* tryDatabasePromise("Failed to count downloads", () =>
    db.select({ value: count() }).from(downloads).where(eq(downloads.status, "queued")),
  );
  return value;
});

export const countActiveDownloads = Effect.fn("SystemRepository.countActiveDownloads")(function* (
  db: AppDatabase,
) {
  const [{ value }] = yield* tryDatabasePromise("Failed to count downloads", () =>
    db
      .select({ value: count() })
      .from(downloads)
      .where(sql`${downloads.status} in ('downloading', 'paused')`),
  );
  return value;
});

export const countFailedDownloads = Effect.fn("SystemRepository.countFailedDownloads")(function* (
  db: AppDatabase,
) {
  const [{ value }] = yield* tryDatabasePromise("Failed to count downloads", () =>
    db.select({ value: count() }).from(downloads).where(eq(downloads.status, "error")),
  );
  return value;
});

export const countImportedDownloads = Effect.fn("SystemRepository.countImportedDownloads")(
  function* (db: AppDatabase) {
    const [{ value }] = yield* tryDatabasePromise("Failed to count downloads", () =>
      db.select({ value: count() }).from(downloads).where(eq(downloads.status, "imported")),
    );
    return value;
  },
);

export const countCompletedDownloads = Effect.fn("SystemRepository.countCompletedDownloads")(
  function* (db: AppDatabase) {
    const [{ value }] = yield* tryDatabasePromise("Failed to count downloads", () =>
      db.select({ value: count() }).from(downloads).where(eq(downloads.status, "completed")),
    );
    return value;
  },
);

export const countRunningBackgroundJobs = Effect.fn("SystemRepository.countRunningBackgroundJobs")(
  function* (db: AppDatabase) {
    const [{ value }] = yield* tryDatabasePromise("Failed to count background jobs", () =>
      db.select({ value: count() }).from(backgroundJobs).where(eq(backgroundJobs.isRunning, true)),
    );
    return value;
  },
);

export const countAnimeRows = Effect.fn("SystemRepository.countAnimeRows")(function* (
  db: AppDatabase,
) {
  const [{ value }] = yield* tryDatabasePromise("Failed to count anime", () =>
    db.select({ value: count() }).from(anime),
  );
  return value;
});

export const countMonitoredAnimeRows = Effect.fn("SystemRepository.countMonitoredAnimeRows")(
  function* (db: AppDatabase) {
    const [{ value }] = yield* tryDatabasePromise("Failed to count anime", () =>
      db.select({ value: count() }).from(anime).where(eq(anime.monitored, true)),
    );
    return value;
  },
);

export const countAnimeUsingProfile = Effect.fn("SystemRepository.countAnimeUsingProfile")(
  function* (db: AppDatabase, profileName: string) {
    const [{ value }] = yield* tryDatabasePromise("Failed to count anime", () =>
      db.select({ value: count() }).from(anime).where(eq(anime.profileName, profileName)),
    );
    return value;
  },
);

export const countEpisodeRows = Effect.fn("SystemRepository.countEpisodeRows")(function* (
  db: AppDatabase,
) {
  const [{ value }] = yield* tryDatabasePromise("Failed to count episodes", () =>
    db.select({ value: count() }).from(episodes),
  );
  return value;
});

export const countDownloadedEpisodeRows = Effect.fn("SystemRepository.countDownloadedEpisodeRows")(
  function* (db: AppDatabase) {
    const [{ value }] = yield* tryDatabasePromise("Failed to count episodes", () =>
      db.select({ value: count() }).from(episodes).where(eq(episodes.downloaded, true)),
    );
    return value;
  },
);

export const countRssFeedRows = Effect.fn("SystemRepository.countRssFeedRows")(function* (
  db: AppDatabase,
) {
  const [{ value }] = yield* tryDatabasePromise("Failed to count RSS feeds", () =>
    db.select({ value: count() }).from(rssFeeds),
  );
  return value;
});

export const loadBackgroundJobRow = Effect.fn("SystemRepository.loadBackgroundJobRow")(function* (
  db: AppDatabase,
  name: string,
) {
  const rows = yield* tryDatabasePromise("Failed to load background job", () =>
    db.select().from(backgroundJobs).where(eq(backgroundJobs.name, name)).limit(1),
  );
  return rows[0];
});

export const listBackgroundJobRows = Effect.fn("SystemRepository.listBackgroundJobRows")(function* (
  db: AppDatabase,
) {
  return yield* tryDatabasePromise("Failed to list background jobs", () =>
    db.select().from(backgroundJobs).orderBy(backgroundJobs.name),
  );
});

export const listUnmappedFolderMatchRows = Effect.fn(
  "SystemRepository.listUnmappedFolderMatchRows",
)(function* (db: AppDatabase) {
  return yield* tryDatabasePromise("Failed to list unmapped folder matches", () =>
    db.select().from(unmappedFolderMatches).orderBy(unmappedFolderMatches.path),
  );
});

export const deleteUnmappedFolderMatchRowsNotInPaths = Effect.fn(
  "SystemRepository.deleteUnmappedFolderMatchRowsNotInPaths",
)(function* (db: AppDatabase, paths: readonly string[]) {
  if (paths.length === 0) {
    yield* tryDatabasePromise("Failed to delete unmapped folder matches", () =>
      db.delete(unmappedFolderMatches),
    );
    return;
  }

  yield* tryDatabasePromise("Failed to delete unmapped folder matches", () =>
    db.delete(unmappedFolderMatches).where(notInArray(unmappedFolderMatches.path, [...paths])),
  );
});

export const upsertUnmappedFolderMatchRows = Effect.fn(
  "SystemRepository.upsertUnmappedFolderMatchRows",
)(function* (
  db: AppDatabase,
  folders: readonly UnmappedFolder[],
  updatedAt = new Date().toISOString(),
) {
  if (folders.length === 0) {
    return;
  }

  yield* tryDatabasePromise("Failed to upsert unmapped folder matches", () =>
    db.transaction(async (tx) => {
      for (const folder of folders) {
        await tx
          .insert(unmappedFolderMatches)
          .values({
            matchAttempts: folder.match_attempts ?? 0,
            lastMatchedAt: folder.last_matched_at ?? null,
            lastMatchError: folder.last_match_error ?? null,
            matchStatus: folder.match_status ?? "pending",
            name: folder.name,
            path: folder.path,
            size: folder.size,
            suggestedMatches: encodeAnimeSearchResultList(folder.suggested_matches),
            updatedAt,
          })
          .onConflictDoUpdate({
            target: unmappedFolderMatches.path,
            set: {
              matchAttempts: folder.match_attempts ?? 0,
              lastMatchedAt: folder.last_matched_at ?? null,
              lastMatchError: folder.last_match_error ?? null,
              matchStatus: folder.match_status ?? "pending",
              name: folder.name,
              size: folder.size,
              suggestedMatches: encodeAnimeSearchResultList(folder.suggested_matches),
              updatedAt,
            },
          });
      }
    }),
  );
});

export const loadUnmappedFolderMatchRow = Effect.fn("SystemRepository.loadUnmappedFolderMatchRow")(
  function* (db: AppDatabase, path: string) {
    const rows = yield* tryDatabasePromise("Failed to load unmapped folder match", () =>
      db.select().from(unmappedFolderMatches).where(eq(unmappedFolderMatches.path, path)).limit(1),
    );
    return rows[0];
  },
);

export const decodeUnmappedFolderMatchRow = Effect.fn(
  "SystemRepository.decodeUnmappedFolderMatchRow",
)(function* (row: typeof unmappedFolderMatches.$inferSelect) {
  const suggestedMatches = yield* decodeAnimeSearchResultList(row.suggestedMatches).pipe(
    Effect.map((decoded) => [...decoded]),
    Effect.mapError(
      () =>
        new StoredUnmappedFolderCorruptError({
          message: `Stored unmapped folder suggestions are corrupt for ${row.path}`,
        }),
    ),
  );

  return {
    match_attempts: row.matchAttempts,
    last_match_error: row.lastMatchError ?? undefined,
    last_matched_at: row.lastMatchedAt ?? undefined,
    match_status: row.matchStatus as UnmappedFolder["match_status"],
    name: row.name,
    path: row.path,
    search_queries: buildUnmappedFolderSearchQueries(row.name),
    size: row.size,
    suggested_matches: suggestedMatches,
  } satisfies UnmappedFolder;
});

export const listRecentSystemLogRows = Effect.fn("SystemRepository.listRecentSystemLogRows")(
  function* (db: AppDatabase, limit: number) {
    return yield* tryDatabasePromise("Failed to list system logs", () =>
      db.select().from(systemLogs).orderBy(desc(systemLogs.id)).limit(limit),
    );
  },
);

export const listRecentDownloadEventRows = Effect.fn(
  "SystemRepository.listRecentDownloadEventRows",
)(function* (db: AppDatabase, limit: number) {
  return yield* tryDatabasePromise("Failed to list download events", () =>
    db.select().from(downloadEvents).orderBy(desc(downloadEvents.id)).limit(limit),
  );
});

export const loadSystemLogPage = Effect.fn("SystemRepository.loadSystemLogPage")(function* (
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
  const conditions = [
    input.level ? eq(systemLogs.level, input.level) : undefined,
    input.eventType ? eventTypeCondition(input.eventType) : undefined,
    input.startDate ? sql`${systemLogs.createdAt} >= ${input.startDate}` : undefined,
    input.endDate ? sql`${systemLogs.createdAt} <= ${input.endDate}` : undefined,
  ].filter((value): value is Exclude<typeof value, undefined> => value !== undefined);
  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
  const countQuery = db.select({ value: count() }).from(systemLogs);
  const rowsQuery = db
    .select()
    .from(systemLogs)
    .orderBy(desc(systemLogs.id))
    .limit(input.pageSize)
    .offset((input.page - 1) * input.pageSize);

  const [{ value: total }] = yield* tryDatabasePromise("Failed to load system logs", () =>
    whereClause ? countQuery.where(whereClause) : countQuery,
  );
  const rows = yield* tryDatabasePromise("Failed to load system logs", () =>
    whereClause ? rowsQuery.where(whereClause) : rowsQuery,
  );

  return { rows, total };
});
