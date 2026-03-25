import { and, eq } from "drizzle-orm";
import { Effect } from "effect";

import type { AppDatabase } from "../../../db/database.ts";
import { anime, episodes } from "../../../db/schema.ts";
import { tryDatabasePromise } from "../../../lib/effect-db.ts";
import { OperationsAnimeNotFoundError } from "../errors.ts";

export const requireAnime = Effect.fn("AnimeRepository.requireAnime")(function* (
  db: AppDatabase,
  animeId: number,
) {
  const rows = yield* tryDatabasePromise("Failed to load anime", () =>
    db.select().from(anime).where(eq(anime.id, animeId)).limit(1),
  );
  const row = rows[0];
  if (!row) {
    return yield* new OperationsAnimeNotFoundError({
      message: "Anime not found",
    });
  }
  return row;
});

export const loadCurrentEpisodeState = Effect.fn("AnimeRepository.loadCurrentEpisodeState")(
  function* (db: AppDatabase, animeId: number, episodeNumber: number) {
    const rows = yield* tryDatabasePromise("Failed to load episode state", () =>
      db
        .select()
        .from(episodes)
        .where(and(eq(episodes.animeId, animeId), eq(episodes.number, episodeNumber)))
        .limit(1),
    );

    if (!rows[0]) {
      return null;
    }

    return {
      downloaded: rows[0].downloaded,
      filePath: rows[0].filePath ?? undefined,
    };
  },
);
