import { eq } from "drizzle-orm";
import { Effect } from "effect";

import type { AppDatabase } from "@/db/database.ts";
import { episodes } from "@/db/schema.ts";
import { toAnimeDto } from "@/features/anime/dto.ts";
import { getAnimeRowEffect } from "@/features/anime/anime-read-repository.ts";
import { tryDatabasePromise } from "@/lib/effect-db.ts";

export const getAnimeEffect = Effect.fn("AnimeQueryGet.getAnimeEffect")(function* (input: {
  db: AppDatabase;
  id: number;
}) {
  const row = yield* getAnimeRowEffect(input.db, input.id);
  const episodeRows = yield* tryDatabasePromise("Failed to load anime", () =>
    input.db.select().from(episodes).where(eq(episodes.animeId, input.id)),
  );

  return yield* toAnimeDto(row, episodeRows);
});
