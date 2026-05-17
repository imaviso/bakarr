import { Effect } from "effect";

import type { AppDatabase } from "@/db/database.ts";
import {
  ensureEpisodesEffect,
  type FutureAiringScheduleEntry,
  updateAnimeEpisodeAirDatesEffect,
} from "@/features/media/units/media-schedule-repository.ts";

export const syncEpisodeScheduleEffect = Effect.fn("AnimeService.syncEpisodeScheduleEffect")(
  function* <E>(
    db: AppDatabase,
    mediaId: number,
    nextAnimeRow: {
      readonly unitCount: number | null;
      readonly status: string;
      readonly startDate: string | null;
      readonly endDate: string | null;
    },
    futureAiringSchedule: ReadonlyArray<FutureAiringScheduleEntry> | undefined,
    nowIso: () => Effect.Effect<string, E>,
  ) {
    yield* ensureEpisodesEffect(
      db,
      mediaId,
      nextAnimeRow.unitCount ?? undefined,
      nextAnimeRow.status,
      nextAnimeRow.startDate ?? undefined,
      nextAnimeRow.endDate ?? undefined,
      futureAiringSchedule,
      false,
      nowIso,
    );
    yield* updateAnimeEpisodeAirDatesEffect(
      db,
      mediaId,
      nextAnimeRow.unitCount ?? undefined,
      nextAnimeRow.status,
      nextAnimeRow.startDate ?? undefined,
      nextAnimeRow.endDate ?? undefined,
      futureAiringSchedule,
      nowIso,
    );
  },
);
