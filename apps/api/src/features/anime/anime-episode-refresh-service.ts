import { Context, Effect, Layer } from "effect";

import type { DatabaseError } from "@/db/database.ts";
import { Database } from "@/db/database.ts";
import { ClockService, nowIsoFromClock } from "@/lib/clock.ts";
import { EventPublisher } from "@/features/events/publisher.ts";
import { AniListClient } from "@/features/anime/anilist.ts";
import type { AnimeServiceError } from "@/features/anime/errors.ts";
import { refreshEpisodesEffect } from "@/features/anime/anime-episode-refresh.ts";

export interface AnimeEpisodeRefreshServiceShape {
  readonly refreshEpisodes: (
    animeId: number,
  ) => Effect.Effect<void, AnimeServiceError | DatabaseError>;
}

export class AnimeEpisodeRefreshService extends Context.Tag(
  "@bakarr/api/AnimeEpisodeRefreshService",
)<AnimeEpisodeRefreshService, AnimeEpisodeRefreshServiceShape>() {}

const makeAnimeEpisodeRefreshService = Effect.gen(function* () {
  const { db } = yield* Database;
  const eventPublisher = yield* EventPublisher;
  const aniList = yield* AniListClient;
  const clock = yield* ClockService;

  const refreshEpisodes = Effect.fn("AnimeEpisodeRefreshService.refreshEpisodes")(function* (
    animeId: number,
  ) {
    return yield* refreshEpisodesEffect({
      aniList,
      animeId,
      db,
      eventPublisher,
      nowIso: () => nowIsoFromClock(clock),
    });
  });

  return { refreshEpisodes } satisfies AnimeEpisodeRefreshServiceShape;
});

export const AnimeEpisodeRefreshServiceLive = Layer.effect(
  AnimeEpisodeRefreshService,
  makeAnimeEpisodeRefreshService,
);
