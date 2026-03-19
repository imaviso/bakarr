import { and, eq, inArray } from "drizzle-orm";
import { Schema } from "effect";

import type { AnimeSearchResult } from "../../../../../packages/shared/src/index.ts";
import type { AppDatabase } from "../../db/database.ts";
import {
  anime,
  appConfig,
  episodes,
  qualityProfiles,
  systemLogs,
} from "../../db/schema.ts";
import {
  decodeConfigCoreOrThrow,
  decodeStoredImagePathOrThrow,
} from "../system/config-codec.ts";
import { makeDefaultConfig } from "../system/defaults.ts";
import { AnimeNotFoundError } from "./errors.ts";

export class UpsertEpisodeError
  extends Schema.TaggedError<UpsertEpisodeError>()(
    "UpsertEpisodeError",
    {
      anime_id: Schema.Number,
      episode_number: Schema.Number,
      message: Schema.String,
      cause: Schema.optional(Schema.Defect),
    },
  ) {}

export async function getAnimeRowOrThrow(db: AppDatabase, animeId: number) {
  const rows = await db.select().from(anime).where(eq(anime.id, animeId)).limit(
    1,
  );
  const row = rows[0];
  if (!row) {
    throw new AnimeNotFoundError({ message: "Anime not found" });
  }
  return row;
}

export async function requireAnimeExists(db: AppDatabase, animeId: number) {
  await getAnimeRowOrThrow(db, animeId);
}

export async function getEpisodeRowOrThrow(
  db: AppDatabase,
  animeId: number,
  episodeNumber: number,
) {
  const rows = await db.select().from(episodes).where(
    and(eq(episodes.animeId, animeId), eq(episodes.number, episodeNumber)),
  ).limit(1);
  const row = rows[0];
  if (!row) {
    throw new AnimeNotFoundError({ message: "Episode not found" });
  }
  return row;
}

export async function ensureEpisodes(
  db: AppDatabase,
  animeId: number,
  episodeCount: number | undefined,
  status: string,
  startDate: string | undefined,
  endDate: string | undefined,
  futureAiringSchedule: ReadonlyArray<FutureAiringScheduleEntry> | undefined,
  resetMissingOnly: boolean,
) {
  const existingRows = !episodeCount || episodeCount <= 0
    ? []
    : await db.select().from(episodes).where(eq(episodes.animeId, animeId));
  const missingRows = buildMissingEpisodeRows({
    animeId,
    episodeCount,
    endDate,
    existingRows,
    futureAiringSchedule,
    resetMissingOnly,
    startDate,
    status,
  });

  if (missingRows.length === 0) {
    return;
  }

  await db.insert(episodes).values(missingRows);
}

export async function upsertEpisode(
  db: AppDatabase,
  animeId: number,
  episodeNumber: number,
  patch: {
    aired?: string | null;
    downloaded?: boolean;
    filePath?: string | null;
    title?: string | null;
  },
) {
  const rows = await db.select().from(episodes).where(
    and(eq(episodes.animeId, animeId), eq(episodes.number, episodeNumber)),
  ).limit(1);

  if (rows[0]) {
    await db.update(episodes).set({
      aired: patch.aired ?? rows[0].aired,
      downloaded: patch.downloaded ?? rows[0].downloaded,
      filePath: patch.filePath ?? rows[0].filePath,
      title: patch.title ?? rows[0].title,
    }).where(eq(episodes.id, rows[0].id));
    return;
  }

  try {
    await db.insert(episodes).values({
      aired: patch.aired ?? null,
      animeId,
      downloaded: patch.downloaded ?? false,
      filePath: patch.filePath ?? null,
      number: episodeNumber,
      title: patch.title ?? null,
    });
  } catch (cause) {
    const existingRows = await db.select().from(episodes).where(
      and(eq(episodes.animeId, animeId), eq(episodes.number, episodeNumber)),
    ).limit(1);

    if (!existingRows[0]) {
      throw new UpsertEpisodeError({
        anime_id: animeId,
        episode_number: episodeNumber,
        message: "Failed to upsert episode",
        cause,
      });
    }

    await db.update(episodes).set({
      aired: patch.aired ?? existingRows[0].aired,
      downloaded: patch.downloaded ?? existingRows[0].downloaded,
      filePath: patch.filePath ?? existingRows[0].filePath,
      title: patch.title ?? existingRows[0].title,
    }).where(eq(episodes.id, existingRows[0].id));
  }
}

export async function clearEpisodeMapping(
  db: AppDatabase,
  animeId: number,
  episodeNumber: number,
) {
  await db.update(episodes).set({
    downloaded: false,
    filePath: null,
  }).where(
    and(eq(episodes.animeId, animeId), eq(episodes.number, episodeNumber)),
  );
}

export async function resolveAnimeRootFolder(
  db: AppDatabase,
  requestedRootFolder: string,
  title: string,
  options: { readonly useExistingRoot?: boolean } = {},
) {
  const trimmed = requestedRootFolder.trim();
  const rows = await db.select().from(appConfig).where(eq(appConfig.id, 1))
    .limit(1);
  const settings = toLibrarySettings(
    rows[0]
      ? decodeConfigCoreOrThrow(rows[0].data)
      : makeDefaultConfig(":memory:"),
  );
  const baseRootFolder = trimmed.length > 0 ? trimmed : settings.libraryPath;

  if (options.useExistingRoot && trimmed.length > 0) {
    return trimmed;
  }

  if (!settings.createAnimeFolders) {
    return baseRootFolder;
  }

  const safeSegment = toSafePathSegment(title);

  if (baseRootFolder.split("/").filter(Boolean).pop() === safeSegment) {
    return baseRootFolder;
  }

  return `${baseRootFolder.replace(/\/$/, "")}/${safeSegment}`;
}

export interface FutureAiringScheduleEntry {
  readonly airingAt: string;
  readonly episode: number;
}

export function buildAiringScheduleMap(
  futureAiringSchedule: ReadonlyArray<FutureAiringScheduleEntry> | undefined,
) {
  return new Map(
    (futureAiringSchedule ?? []).map((
      entry,
    ) => [entry.episode, entry.airingAt]),
  );
}

export async function updateAnimeEpisodeAirDates(
  db: AppDatabase,
  animeId: number,
  episodeCount: number | undefined,
  status: string,
  startDate: string | undefined,
  endDate: string | undefined,
  futureAiringSchedule: ReadonlyArray<FutureAiringScheduleEntry> | undefined,
) {
  if (!episodeCount || episodeCount <= 0) {
    return;
  }

  const existingRows = await db.select().from(episodes).where(
    eq(episodes.animeId, animeId),
  );
  const scheduleMap = buildAiringScheduleMap(futureAiringSchedule);

  for (const row of existingRows) {
    const inferred = inferAiredAt(
      status,
      row.number,
      episodeCount,
      startDate,
      endDate,
      scheduleMap,
    );

    if (row.aired === inferred) {
      continue;
    }

    await db.update(episodes).set({ aired: inferred }).where(
      eq(episodes.id, row.id),
    );
  }
}

export async function markSearchResultsAlreadyInLibrary(
  db: AppDatabase,
  results: readonly AnimeSearchResult[],
) {
  const ids = [...new Set(results.map((result) => result.id))];

  if (ids.length === 0) {
    return [...results];
  }

  const rows = await db.select({ id: anime.id }).from(anime).where(
    inArray(anime.id, ids),
  );
  const libraryIds = new Set(rows.map((row) => row.id));

  return results.map((result) => ({
    ...result,
    already_in_library: libraryIds.has(result.id),
  }));
}

export async function qualityProfileExists(
  db: AppDatabase,
  name: string,
): Promise<boolean> {
  const rows = await db
    .select({ name: qualityProfiles.name })
    .from(qualityProfiles)
    .where(eq(qualityProfiles.name, name))
    .limit(1);
  return rows.length > 0;
}

export async function findAnimeRootFolderOwner(
  db: AppDatabase,
  rootFolder: string,
) {
  const normalized = normalizeRootFolder(rootFolder);
  const rows = await db.select({
    id: anime.id,
    rootFolder: anime.rootFolder,
    titleRomaji: anime.titleRomaji,
  }).from(anime);

  return rows.find((row) => {
    const existing = normalizeRootFolder(row.rootFolder);
    return (
      existing === normalized ||
      normalized.startsWith(`${existing}/`) ||
      existing.startsWith(`${normalized}/`)
    );
  }) ?? null;
}

function normalizeRootFolder(rootFolder: string) {
  if (rootFolder === "/") {
    return "/";
  }

  return rootFolder.replace(/\/+$/, "");
}

export async function getConfiguredImagesPath(db: AppDatabase) {
  const rows = await db.select().from(appConfig).where(eq(appConfig.id, 1))
    .limit(1);

  return decodeStoredImagePathOrThrow(rows[0]);
}

export async function appendAnimeLog(
  db: AppDatabase,
  eventType: string,
  level: string,
  message: string,
) {
  await db.insert(systemLogs).values({
    createdAt: new Date().toISOString(),
    details: null,
    eventType,
    level,
    message,
  });
}

export async function insertAnimeAggregateAtomic(
  db: AppDatabase,
  input: {
    animeRow: typeof anime.$inferInsert;
    episodeRows: readonly (typeof episodes.$inferInsert)[];
    log: typeof systemLogs.$inferInsert;
  },
) {
  await db.transaction(async (tx) => {
    await tx.insert(anime).values(input.animeRow);

    if (input.episodeRows.length > 0) {
      await tx.insert(episodes).values([...input.episodeRows]);
    }

    await tx.insert(systemLogs).values(input.log);
  });
}

export function buildMissingEpisodeRows(input: {
  animeId: number;
  episodeCount: number | undefined;
  status: string;
  startDate: string | undefined;
  endDate: string | undefined;
  futureAiringSchedule: ReadonlyArray<FutureAiringScheduleEntry> | undefined;
  resetMissingOnly: boolean;
  existingRows: readonly typeof episodes.$inferSelect[];
}) {
  if (!input.episodeCount || input.episodeCount <= 0) {
    return [] as (typeof episodes.$inferInsert)[];
  }

  const existingByNumber = new Map(
    input.existingRows.map((row) => [row.number, row]),
  );
  const airingScheduleByEpisode = buildAiringScheduleMap(
    input.futureAiringSchedule,
  );

  return range(1, input.episodeCount).flatMap((number) => {
    const existing = existingByNumber.get(number);

    if (existing) {
      if (input.resetMissingOnly && existing.downloaded) {
        return [];
      }

      return [];
    }

    return [
      {
        aired: inferAiredAt(
          input.status,
          number,
          input.episodeCount,
          input.startDate,
          input.endDate,
          airingScheduleByEpisode,
        ),
        animeId: input.animeId,
        downloaded: false,
        filePath: null,
        number,
        title: null,
      } satisfies typeof episodes.$inferInsert,
    ];
  });
}

export function inferAiredAt(
  status: string,
  episodeNumber: number,
  episodeCount: number | undefined,
  startDate: string | undefined,
  endDate: string | undefined,
  futureAiringSchedule?: ReadonlyMap<number, string>,
) {
  const scheduledAiringAt = futureAiringSchedule?.get(episodeNumber);

  if (scheduledAiringAt) {
    return scheduledAiringAt;
  }

  if (!startDate) {
    return status === "FINISHED" ? new Date().toISOString() : null;
  }

  const start = new Date(`${startDate}T00:00:00Z`);

  if (Number.isNaN(start.getTime())) {
    return status === "FINISHED" ? new Date().toISOString() : null;
  }

  if (status === "FINISHED" && endDate && episodeCount && episodeCount > 1) {
    const end = new Date(`${endDate}T00:00:00Z`);

    if (!Number.isNaN(end.getTime())) {
      const spanMs = Math.max(end.getTime() - start.getTime(), 0);
      const intervalMs = episodeCount > 1
        ? Math.floor(spanMs / (episodeCount - 1))
        : 0;
      return new Date(start.getTime() + intervalMs * (episodeNumber - 1))
        .toISOString();
    }
  }

  const weeklyMs = 7 * 24 * 60 * 60 * 1000;
  return new Date(start.getTime() + weeklyMs * (episodeNumber - 1))
    .toISOString();
}

function toLibrarySettings(config: {
  downloads: { create_anime_folders: boolean };
  library: { library_path: string };
}) {
  return {
    createAnimeFolders: config.downloads.create_anime_folders,
    libraryPath: config.library.library_path.trim() || "./library",
  };
}

function toSafePathSegment(value: string) {
  return value.replace(/[<>:"/\\|?*]/g, " ").replace(/\s+/g, " ").trim() ||
    "anime";
}

function range(start: number, end: number) {
  return Array.from(
    { length: Math.max(end - start + 1, 0) },
    (_, index) => start + index,
  );
}
