import { eq } from "drizzle-orm";
import { Context, Effect, Layer } from "effect";

import { Database, type DatabaseError } from "@/db/database.ts";
import { anime } from "@/db/schema.ts";
import { ClockService, nowIsoFromClock } from "@/lib/clock.ts";
import { tryDatabasePromise } from "@/lib/effect-db.ts";
import { appendSystemLog } from "@/features/system/support.ts";

export interface AnimeDeleteServiceShape {
  readonly deleteAnime: (id: number) => Effect.Effect<void, DatabaseError>;
}

export class AnimeDeleteService extends Context.Tag("@bakarr/api/AnimeDeleteService")<
  AnimeDeleteService,
  AnimeDeleteServiceShape
>() {}

const makeAnimeDeleteService = Effect.gen(function* () {
  const { db } = yield* Database;
  const clock = yield* ClockService;
  const nowIso = () => nowIsoFromClock(clock);

  const deleteAnime = Effect.fn("AnimeDeleteService.deleteAnime")(function* (id: number) {
    yield* tryDatabasePromise("Failed to delete anime", () =>
      db.delete(anime).where(eq(anime.id, id)),
    );
    yield* appendSystemLog(db, "anime.deleted", "success", `Deleted anime ${id}`, nowIso);
  });

  return { deleteAnime } satisfies AnimeDeleteServiceShape;
});

export const AnimeDeleteServiceLive = Layer.effect(AnimeDeleteService, makeAnimeDeleteService);
