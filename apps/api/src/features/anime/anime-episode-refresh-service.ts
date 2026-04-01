import { Context, Effect, Layer, Option } from "effect";

import { Database, type DatabaseError } from "@/db/database.ts";
import { ClockService, nowIsoFromClock } from "@/lib/clock.ts";
import { EventPublisher } from "@/features/events/publisher.ts";
import { AniListClient } from "@/features/anime/anilist.ts";
import type { AnimeServiceError } from "@/features/anime/errors.ts";
import { syncEpisodeScheduleEffect } from "@/features/anime/anime-episode-schedule-sync.ts";
import { syncAnimeMetadataEffect } from "@/features/anime/anime-metadata-sync.ts";
import { appendSystemLog } from "@/features/system/support.ts";

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
  const nowIso = () => nowIsoFromClock(clock);

  const refreshEpisodes = Effect.fn("AnimeEpisodeRefreshService.refreshEpisodes")(function* (
    animeId: number,
  ) {
    const { animeRow, metadata, nextAnimeRow } = yield* syncAnimeMetadataEffect({
      aniList,
      animeId,
      db,
      eventPublisher: Option.some(eventPublisher),
      nowIso,
    });

    yield* syncEpisodeScheduleEffect(
      db,
      animeId,
      nextAnimeRow,
      metadata?.futureAiringSchedule,
      nowIso,
    );
    yield* appendSystemLog(
      db,
      "anime.episodes.refreshed",
      "success",
      `Refreshed episodes for ${animeRow.titleRomaji}`,
      nowIso,
    );
    yield* eventPublisher.publish({
      type: "RefreshFinished",
      payload: { anime_id: animeId, title: animeRow.titleRomaji },
    });
  });

  return { refreshEpisodes } satisfies AnimeEpisodeRefreshServiceShape;
});

export const AnimeEpisodeRefreshServiceLive = Layer.effect(
  AnimeEpisodeRefreshService,
  makeAnimeEpisodeRefreshService,
);
