import { eq } from "drizzle-orm";
import { Effect } from "effect";

import type { AppDatabase } from "../../db/database.ts";
import { anime } from "../../db/schema.ts";
import { appendAnimeLogEffect } from "./repository.ts";
import { tryDatabasePromise } from "./service-support.ts";

export const deleteAnimeEffect = Effect.fn("AnimeService.deleteAnimeEffect")(function* (
  db: AppDatabase,
  id: number,
  nowIso: () => Effect.Effect<string>,
) {
  yield* tryDatabasePromise("Failed to delete anime", () =>
    db.delete(anime).where(eq(anime.id, id)),
  );
  yield* appendAnimeLogEffect(db, "anime.deleted", "success", `Deleted anime ${id}`, nowIso);
});
