import { and, eq } from "drizzle-orm";
import { Effect } from "effect";

import type { AppDatabase } from "@/db/database.ts";
import { anime, episodes } from "@/db/schema.ts";
import { tryDatabasePromise } from "@/lib/effect-db.ts";
import { AnimeNotFoundError } from "@/features/anime/errors.ts";

export const getAnimeRowEffect = Effect.fn("AnimeRepository.getAnimeRow")(function* (
  db: AppDatabase,
  animeId: number,
) {
  const rows = yield* tryDatabasePromise("Failed to load anime", () =>
    db.select().from(anime).where(eq(anime.id, animeId)).limit(1),
  );
  const [row] = rows;
  if (!row) {
    return yield* new AnimeNotFoundError({ message: "Anime not found" });
  }
  return row;
});

export const requireAnimeExistsEffect = Effect.fn("AnimeRepository.requireAnimeExists")(function* (
  db: AppDatabase,
  animeId: number,
) {
  yield* getAnimeRowEffect(db, animeId);
});

export const getEpisodeRowEffect = Effect.fn("AnimeRepository.getEpisodeRow")(function* (
  db: AppDatabase,
  animeId: number,
  episodeNumber: number,
) {
  const rows = yield* tryDatabasePromise("Failed to load episode", () =>
    db
      .select()
      .from(episodes)
      .where(and(eq(episodes.animeId, animeId), eq(episodes.number, episodeNumber)))
      .limit(1),
  );
  const [row] = rows;
  if (!row) {
    return yield* new AnimeNotFoundError({ message: "Episode not found" });
  }
  return row;
});

export const findAnimeRootFolderOwnerEffect = Effect.fn("AnimeRepository.findAnimeRootFolderOwner")(
  function* (db: AppDatabase, rootFolder: string) {
    const normalized = normalizeRootFolder(rootFolder);
    const rows = yield* tryDatabasePromise("Failed to find anime root folder owner", () =>
      db
        .select({
          id: anime.id,
          rootFolder: anime.rootFolder,
          titleRomaji: anime.titleRomaji,
        })
        .from(anime),
    );

    return (
      rows.find((row) => {
        const existing = normalizeRootFolder(row.rootFolder);
        return (
          existing === normalized ||
          normalized.startsWith(`${existing}/`) ||
          existing.startsWith(`${normalized}/`)
        );
      }) ?? null
    );
  },
);

function normalizeRootFolder(rootFolder: string) {
  if (rootFolder === "/") {
    return "/";
  }

  return rootFolder.replace(/\/+$/, "");
}
