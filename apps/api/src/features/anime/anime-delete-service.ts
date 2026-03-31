import { Context, Effect, Layer } from "effect";

import type { DatabaseError } from "@/db/database.ts";
import { Database } from "@/db/database.ts";
import { ClockService, nowIsoFromClock } from "@/lib/clock.ts";
import { deleteAnimeEffect } from "@/features/anime/delete-support.ts";

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

  const deleteAnime = Effect.fn("AnimeDeleteService.deleteAnime")(function* (id: number) {
    return yield* deleteAnimeEffect(db, id, () => nowIsoFromClock(clock));
  });

  return { deleteAnime } satisfies AnimeDeleteServiceShape;
});

export const AnimeDeleteServiceLive = Layer.effect(AnimeDeleteService, makeAnimeDeleteService);
