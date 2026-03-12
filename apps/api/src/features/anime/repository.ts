import { and, eq } from "drizzle-orm";

import type { AppDatabase } from "../../db/database.ts";
import { anime, appConfig, episodes, systemLogs } from "../../db/schema.ts";
import { decodeConfigCore } from "../system/config-codec.ts";
import { AnimeServiceError } from "./errors.ts";

export async function getAnimeRowOrThrow(db: AppDatabase, animeId: number) {
  const rows = await db.select().from(anime).where(eq(anime.id, animeId)).limit(1);
  const row = rows[0];
  if (!row) {
    throw new AnimeServiceError({ message: "Anime not found", status: 404 });
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
    throw new AnimeServiceError({ message: "Episode not found", status: 404 });
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
  resetMissingOnly: boolean,
) {
  if (!episodeCount || episodeCount <= 0) {
    return;
  }

  const existingRows = await db.select().from(episodes).where(eq(episodes.animeId, animeId));
  const existingByNumber = new Map(existingRows.map((row) => [row.number, row]));
  const numbers = range(1, episodeCount);

  for (const number of numbers) {
    const existing = existingByNumber.get(number);

    if (existing) {
      if (resetMissingOnly && existing.downloaded) {
        continue;
      }

      continue;
    }

    await db.insert(episodes).values({
      aired: inferAiredAt(status, number, episodeCount, startDate, endDate),
      animeId,
      downloaded: false,
      filePath: null,
      number,
      title: null,
    });
  }
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

  await db.insert(episodes).values({
    aired: patch.aired ?? null,
    animeId,
    downloaded: patch.downloaded ?? false,
    filePath: patch.filePath ?? null,
    number: episodeNumber,
    title: patch.title ?? null,
  });
}

export async function clearEpisodeMapping(
  db: AppDatabase,
  animeId: number,
  episodeNumber: number,
) {
  await db.update(episodes).set({
    downloaded: false,
    filePath: null,
  }).where(and(eq(episodes.animeId, animeId), eq(episodes.number, episodeNumber)));
}

export async function resolveAnimeRootFolder(
  db: AppDatabase,
  requestedRootFolder: string,
  title: string,
) {
  const trimmed = requestedRootFolder.trim();

  if (trimmed.length > 0) {
    return trimmed;
  }

  const rows = await db.select().from(appConfig).where(eq(appConfig.id, 1)).limit(1);
  const libraryPath = rows[0] ? parseLibraryPath(rows[0].data) : "./library";

  return `${libraryPath.replace(/\/$/, "")}/${toSafePathSegment(title)}`;
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

export function inferAiredAt(
  status: string,
  episodeNumber: number,
  episodeCount: number | undefined,
  startDate: string | undefined,
  endDate: string | undefined,
) {
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
      const intervalMs = episodeCount > 1 ? Math.floor(spanMs / (episodeCount - 1)) : 0;
      return new Date(start.getTime() + intervalMs * (episodeNumber - 1)).toISOString();
    }
  }

  const weeklyMs = 7 * 24 * 60 * 60 * 1000;
  return new Date(start.getTime() + weeklyMs * (episodeNumber - 1)).toISOString();
}

function parseLibraryPath(configJson: string) {
  try {
    return decodeConfigCore(configJson).library.library_path.trim() || "./library";
  } catch {
    return "./library";
  }
}

function toSafePathSegment(value: string) {
  return value.replace(/[<>:"/\\|?*]/g, " ").replace(/\s+/g, " ").trim() || "anime";
}

function range(start: number, end: number) {
  return Array.from(
    { length: Math.max(end - start + 1, 0) },
    (_, index) => start + index,
  );
}
