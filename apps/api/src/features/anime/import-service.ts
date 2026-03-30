import { Context, Effect, Layer } from "effect";

import { Database } from "@/db/database.ts";
import { upsertEpisodeEffect } from "@/features/anime/anime-episode-repository.ts";

export interface AnimeImportServiceShape {
  readonly upsertEpisode: (
    animeId: number,
    episodeNumber: number,
    patch: Parameters<typeof upsertEpisodeEffect>[3],
  ) => ReturnType<typeof upsertEpisodeEffect>;
}

export class AnimeImportService extends Context.Tag("@bakarr/api/AnimeImportService")<
  AnimeImportService,
  AnimeImportServiceShape
>() {}

export const AnimeImportServiceLive = Layer.effect(
  AnimeImportService,
  Effect.gen(function* () {
    const { db } = yield* Database;

    return {
      upsertEpisode: (animeId, episodeNumber, patch) =>
        upsertEpisodeEffect(db, animeId, episodeNumber, patch),
    } satisfies AnimeImportServiceShape;
  }),
);
