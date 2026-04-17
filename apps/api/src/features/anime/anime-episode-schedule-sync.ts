import { Effect } from "effect";

import type { AppDatabase } from "@/db/database.ts";
import {
  ensureEpisodesEffect,
  type FutureAiringScheduleEntry,
  updateAnimeEpisodeAirDatesEffect,
} from "@/features/anime/anime-schedule-repository.ts";

export const syncEpisodeScheduleEffect = Effect.fn("AnimeService.syncEpisodeScheduleEffect")(
  function* <E>(
    db: AppDatabase,
    animeId: number,
    nextAnimeRow: {
      readonly episodeCount: number | null;
      readonly status: string;
      readonly startDate: string | null;
      readonly endDate: string | null;
    },
    futureAiringSchedule: ReadonlyArray<FutureAiringScheduleEntry> | undefined,
    nowIso: () => Effect.Effect<string, E>,
  ) {
    yield* ensureEpisodesEffect(
      db,
      animeId,
      nextAnimeRow.episodeCount ?? undefined,
      nextAnimeRow.status,
      nextAnimeRow.startDate ?? undefined,
      nextAnimeRow.endDate ?? undefined,
      futureAiringSchedule,
      false,
      nowIso,
    );
    yield* updateAnimeEpisodeAirDatesEffect(
      db,
      animeId,
      nextAnimeRow.episodeCount ?? undefined,
      nextAnimeRow.status,
      nextAnimeRow.startDate ?? undefined,
      nextAnimeRow.endDate ?? undefined,
      futureAiringSchedule,
      nowIso,
    );
  },
);
