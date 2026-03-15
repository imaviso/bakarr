import { and, count, desc, eq, notInArray, sql } from "drizzle-orm";
import { Schema } from "effect";

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
import { eventTypeCondition } from "./support.ts";

export type QualityProfileRow = typeof qualityProfiles.$inferSelect;
export type QualityProfileInsert = typeof qualityProfiles.$inferInsert;
export type ReleaseProfileRow = typeof releaseProfiles.$inferSelect;
export type ReleaseProfileInsert = typeof releaseProfiles.$inferInsert;

const AnimeSearchResultListJsonSchema = Schema.parseJson(
  Schema.Array(AnimeSearchResultSchema),
);
const decodeAnimeSearchResultList = Schema.decodeUnknownSync(
  AnimeSearchResultListJsonSchema,
);
const encodeAnimeSearchResultList = Schema.encodeSync(
  AnimeSearchResultListJsonSchema,
);

export async function loadSystemConfigRow(db: AppDatabase) {
  const rows = await db.select().from(appConfig).where(eq(appConfig.id, 1))
    .limit(1);
  return rows[0];
}

export function insertSystemConfigRow(
  db: AppDatabase,
  input: typeof appConfig.$inferInsert,
) {
  return db.insert(appConfig).values(input);
}

export function upsertSystemConfigRow(
  db: AppDatabase,
  input: typeof appConfig.$inferInsert,
) {
  return db.insert(appConfig).values(input).onConflictDoUpdate({
    target: appConfig.id,
    set: { data: input.data, updatedAt: input.updatedAt },
  });
}

export async function updateSystemConfigAtomic(
  db: AppDatabase,
  coreInput: typeof appConfig.$inferInsert,
  profileRows: readonly QualityProfileInsert[],
) {
  await db.transaction(async (tx) => {
    await tx.insert(appConfig).values(coreInput).onConflictDoUpdate({
      target: appConfig.id,
      set: { data: coreInput.data, updatedAt: coreInput.updatedAt },
    });

    await tx.delete(qualityProfiles);

    if (profileRows.length > 0) {
      await tx.insert(qualityProfiles).values([...profileRows]);
    }

    await tx.insert(systemLogs).values({
      createdAt: coreInput.updatedAt || new Date().toISOString(),
      eventType: "system.config.updated",
      level: "success",
      message: "System configuration updated",
    });
  });
}

export async function loadAnyQualityProfileRow(db: AppDatabase) {
  const rows = await db.select().from(qualityProfiles).limit(1);
  return rows[0];
}

export function listQualityProfileRows(db: AppDatabase) {
  return db.select().from(qualityProfiles).orderBy(qualityProfiles.name);
}

export function insertQualityProfileRow(
  db: AppDatabase,
  row: QualityProfileInsert,
) {
  return db.insert(qualityProfiles).values(row);
}

export async function insertQualityProfileRows(
  db: AppDatabase,
  rows: readonly QualityProfileInsert[],
) {
  if (rows.length === 0) {
    return;
  }

  await db.insert(qualityProfiles).values([...rows]);
}

export async function loadQualityProfileRow(db: AppDatabase, name: string) {
  const rows = await db.select().from(qualityProfiles).where(
    eq(qualityProfiles.name, name),
  )
    .limit(1);
  return rows[0];
}

export function updateQualityProfileRow(
  db: AppDatabase,
  name: string,
  row: QualityProfileInsert,
) {
  return db.update(qualityProfiles).set(row).where(
    eq(qualityProfiles.name, name),
  );
}

export async function renameQualityProfileWithCascade(
  db: AppDatabase,
  oldName: string,
  row: QualityProfileInsert,
) {
  await db.transaction(async (tx) => {
    await tx.update(qualityProfiles).set(row).where(
      eq(qualityProfiles.name, oldName),
    );

    if (oldName !== row.name) {
      await tx.update(anime).set({ profileName: row.name }).where(
        eq(anime.profileName, oldName),
      );
    }
  });
}

export function deleteQualityProfileRow(db: AppDatabase, name: string) {
  return db.delete(qualityProfiles).where(eq(qualityProfiles.name, name));
}

export async function replaceQualityProfileRows(
  db: AppDatabase,
  rows: readonly QualityProfileInsert[],
) {
  await db.transaction(async (tx) => {
    await tx.delete(qualityProfiles);

    if (rows.length === 0) {
      return;
    }

    await tx.insert(qualityProfiles).values([...rows]);
  });
}

export function listReleaseProfileRows(db: AppDatabase) {
  return db.select().from(releaseProfiles).orderBy(releaseProfiles.id);
}

export async function insertReleaseProfileRow(
  db: AppDatabase,
  row: ReleaseProfileInsert,
) {
  const rows = await db.insert(releaseProfiles).values(row).returning();
  return rows[0] as ReleaseProfileRow;
}

export function updateReleaseProfileRow(
  db: AppDatabase,
  id: number,
  row: Partial<ReleaseProfileInsert>,
) {
  return db.update(releaseProfiles).set(row).where(eq(releaseProfiles.id, id));
}

export function deleteReleaseProfileRow(db: AppDatabase, id: number) {
  return db.delete(releaseProfiles).where(eq(releaseProfiles.id, id));
}

export async function countQueuedOrDownloadingDownloads(db: AppDatabase) {
  const [{ value }] = await db.select({ value: count() }).from(downloads).where(
    sql`${downloads.status} in ('queued', 'downloading')`,
  );
  return value;
}

export async function countQueuedDownloads(db: AppDatabase) {
  const [{ value }] = await db.select({ value: count() }).from(downloads).where(
    eq(downloads.status, "queued"),
  );
  return value;
}

export async function countActiveDownloads(db: AppDatabase) {
  const [{ value }] = await db.select({ value: count() }).from(downloads).where(
    sql`${downloads.status} in ('downloading', 'paused')`,
  );
  return value;
}

export async function countFailedDownloads(db: AppDatabase) {
  const [{ value }] = await db.select({ value: count() }).from(downloads).where(
    eq(downloads.status, "error"),
  );
  return value;
}

export async function countImportedDownloads(db: AppDatabase) {
  const [{ value }] = await db.select({ value: count() }).from(downloads).where(
    eq(downloads.status, "imported"),
  );
  return value;
}

export async function countCompletedDownloads(db: AppDatabase) {
  const [{ value }] = await db.select({ value: count() }).from(downloads).where(
    eq(downloads.status, "completed"),
  );
  return value;
}

export async function countRunningBackgroundJobs(db: AppDatabase) {
  const [{ value }] = await db.select({ value: count() }).from(backgroundJobs)
    .where(eq(backgroundJobs.isRunning, true));
  return value;
}

export async function countAnimeRows(db: AppDatabase) {
  const [{ value }] = await db.select({ value: count() }).from(anime);
  return value;
}

export async function countAnimeUsingProfile(
  db: AppDatabase,
  profileName: string,
) {
  const [{ value }] = await db
    .select({ value: count() })
    .from(anime)
    .where(eq(anime.profileName, profileName));
  return value;
}

export async function countEpisodeRows(db: AppDatabase) {
  const [{ value }] = await db.select({ value: count() }).from(episodes);
  return value;
}

export async function countDownloadedEpisodeRows(db: AppDatabase) {
  const [{ value }] = await db.select({ value: count() }).from(episodes).where(
    eq(episodes.downloaded, true),
  );
  return value;
}

export async function countRssFeedRows(db: AppDatabase) {
  const [{ value }] = await db.select({ value: count() }).from(rssFeeds);
  return value;
}

export async function loadBackgroundJobRow(db: AppDatabase, name: string) {
  const rows = await db.select().from(backgroundJobs).where(
    eq(backgroundJobs.name, name),
  ).limit(1);
  return rows[0];
}

export function listBackgroundJobRows(db: AppDatabase) {
  return db.select().from(backgroundJobs).orderBy(backgroundJobs.name);
}

export async function listUnmappedFolderMatchRows(db: AppDatabase) {
  return await db.select().from(unmappedFolderMatches).orderBy(
    unmappedFolderMatches.path,
  );
}

export async function deleteUnmappedFolderMatchRowsNotInPaths(
  db: AppDatabase,
  paths: readonly string[],
) {
  if (paths.length === 0) {
    await db.delete(unmappedFolderMatches);
    return;
  }

  await db.delete(unmappedFolderMatches).where(
    notInArray(unmappedFolderMatches.path, [...paths]),
  );
}

export async function upsertUnmappedFolderMatchRows(
  db: AppDatabase,
  folders: readonly UnmappedFolder[],
) {
  if (folders.length === 0) {
    return;
  }

  const updatedAt = new Date().toISOString();

  await db.transaction(async (tx) => {
    for (const folder of folders) {
      await tx.insert(unmappedFolderMatches).values({
        lastMatchedAt: folder.last_matched_at ?? null,
        lastMatchError: folder.last_match_error ?? null,
        matchStatus: folder.match_status ?? "pending",
        name: folder.name,
        path: folder.path,
        size: folder.size,
        suggestedMatches: encodeAnimeSearchResultList(folder.suggested_matches),
        updatedAt,
      }).onConflictDoUpdate({
        target: unmappedFolderMatches.path,
        set: {
          lastMatchedAt: folder.last_matched_at ?? null,
          lastMatchError: folder.last_match_error ?? null,
          matchStatus: folder.match_status ?? "pending",
          name: folder.name,
          size: folder.size,
          suggestedMatches: encodeAnimeSearchResultList(
            folder.suggested_matches,
          ),
          updatedAt,
        },
      });
    }
  });
}

export function decodeUnmappedFolderMatchRow(
  row: typeof unmappedFolderMatches.$inferSelect,
): UnmappedFolder {
  return {
    last_match_error: row.lastMatchError ?? undefined,
    last_matched_at: row.lastMatchedAt ?? undefined,
    match_status: row.matchStatus as UnmappedFolder["match_status"],
    name: row.name,
    path: row.path,
    size: row.size,
    suggested_matches: [...decodeAnimeSearchResultList(row.suggestedMatches)],
  };
}

export function listRecentSystemLogRows(db: AppDatabase, limit: number) {
  return db.select().from(systemLogs).orderBy(desc(systemLogs.id)).limit(limit);
}

export function listRecentDownloadEventRows(db: AppDatabase, limit: number) {
  return db.select().from(downloadEvents).orderBy(desc(downloadEvents.id))
    .limit(
      limit,
    );
}

export async function loadSystemLogPage(
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
    input.startDate
      ? sql`${systemLogs.createdAt} >= ${input.startDate}`
      : undefined,
    input.endDate
      ? sql`${systemLogs.createdAt} <= ${input.endDate}`
      : undefined,
  ].filter((value): value is Exclude<typeof value, undefined> =>
    value !== undefined
  );
  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
  const countQuery = db.select({ value: count() }).from(systemLogs);
  const rowsQuery = db.select().from(systemLogs).orderBy(desc(systemLogs.id))
    .limit(input.pageSize)
    .offset((input.page - 1) * input.pageSize);

  const [{ value: total }] = await (
    whereClause ? countQuery.where(whereClause) : countQuery
  );
  const rows = await (whereClause ? rowsQuery.where(whereClause) : rowsQuery);

  return { rows, total };
}
