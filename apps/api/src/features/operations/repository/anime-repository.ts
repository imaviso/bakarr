import { and, eq } from "drizzle-orm";

import type { AppDatabase } from "../../../db/database.ts";
import { anime, episodes } from "../../../db/schema.ts";
import { OperationsAnimeNotFoundError } from "../errors.ts";
import type { CurrentEpisodeState } from "./types.ts";

export async function requireAnime(db: AppDatabase, animeId: number) {
  const rows = await db.select().from(anime).where(eq(anime.id, animeId)).limit(
    1,
  );
  const row = rows[0];
  if (!row) {
    throw new OperationsAnimeNotFoundError({ message: "Anime not found" });
  }
  return row;
}

export async function loadCurrentEpisodeState(
  db: AppDatabase,
  animeId: number,
  episodeNumber: number,
): Promise<CurrentEpisodeState | null> {
  const rows = await db.select().from(episodes).where(
    and(eq(episodes.animeId, animeId), eq(episodes.number, episodeNumber)),
  ).limit(1);

  if (!rows[0]) {
    return null;
  }

  return {
    downloaded: rows[0].downloaded,
    filePath: rows[0].filePath ?? undefined,
  };
}
