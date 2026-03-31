import { Effect } from "effect";

import type { AppDatabase } from "@/db/database.ts";
import type { AniListClient } from "@/features/anime/anilist.ts";
import type { AnimeEventPublisher } from "@/features/anime/anime-orchestration-shared.ts";
import { syncEpisodeScheduleEffect } from "@/features/anime/anime-episode-schedule-sync.ts";
import { syncAnimeMetadataEffect } from "@/features/anime/anime-metadata-sync.ts";
import { appendSystemLog } from "@/features/system/support.ts";

export const refreshEpisodesEffect = Effect.fn("AnimeService.refreshEpisodesEffect")(
  function* (input: {
    aniList: typeof AniListClient.Service;
    animeId: number;
    db: AppDatabase;
    eventPublisher: AnimeEventPublisher;
    nowIso: () => Effect.Effect<string>;
  }) {
    const { nowIso } = input;
    const { animeRow, metadata, nextAnimeRow } = yield* syncAnimeMetadataEffect({
      aniList: input.aniList,
      animeId: input.animeId,
      db: input.db,
      eventPublisher: input.eventPublisher,
      nowIso,
    });

    yield* syncEpisodeScheduleEffect(
      input.db,
      input.animeId,
      nextAnimeRow,
      metadata?.futureAiringSchedule,
      nowIso,
    );
    yield* appendSystemLog(
      input.db,
      "anime.episodes.refreshed",
      "success",
      `Refreshed episodes for ${animeRow.titleRomaji}`,
      nowIso,
    );
    yield* input.eventPublisher.publish({
      type: "RefreshFinished",
      payload: { anime_id: input.animeId, title: animeRow.titleRomaji },
    });
  },
);
