import { eq } from "drizzle-orm";
import { Effect, Option } from "effect";

import type { AppDatabase } from "@/db/database.ts";
import { anime } from "@/db/schema.ts";
import type { AniListClient } from "@/features/anime/anilist.ts";
import { syncEpisodeScheduleEffect } from "@/features/anime/anime-episode-schedule-sync.ts";
import { syncAnimeMetadataEffect } from "@/features/anime/anime-metadata-sync.ts";
import { tryDatabasePromise } from "@/lib/effect-db.ts";
import {
  formatJobFailureMessage,
  markJobFailed,
  markJobStarted,
  markJobSucceeded,
} from "@/lib/job-status.ts";
import { appendSystemLog } from "@/features/system/support.ts";

export const refreshMetadataForMonitoredAnimeEffect = Effect.fn(
  "AnimeService.refreshMetadataForMonitoredAnimeEffect",
)(function* (input: {
  aniList: typeof AniListClient.Service;
  db: AppDatabase;
  nowIso: () => Effect.Effect<string>;
}) {
  const { nowIso } = input;
  yield* markJobStarted(input.db, "metadata_refresh", nowIso);
  yield* appendSystemLog(
    input.db,
    "system.task.metadata_refresh.started",
    "info",
    "Metadata refresh started",
    nowIso,
  );

  return yield* Effect.gen(function* () {
    const animeRows = yield* tryDatabasePromise("Failed to refresh metadata", () =>
      input.db.select().from(anime).where(eq(anime.monitored, true)),
    );
    let refreshed = 0;

    yield* Effect.forEach(
      animeRows,
      (animeRow) =>
        Effect.gen(function* () {
          const { metadata, nextAnimeRow } = yield* syncAnimeMetadataEffect({
            aniList: input.aniList,
            animeId: animeRow.id,
            db: input.db,
            eventPublisher: Option.none(),
            nowIso,
          });

          yield* syncEpisodeScheduleEffect(
            input.db,
            animeRow.id,
            nextAnimeRow,
            metadata?.futureAiringSchedule,
            nowIso,
          );
          refreshed += 1;
        }),
      { concurrency: 4, discard: true },
    );

    const message = `Refreshed ${refreshed} monitored anime`;

    yield* markJobSucceeded(input.db, "metadata_refresh", message, nowIso);
    yield* appendSystemLog(
      input.db,
      "system.task.metadata_refresh.completed",
      "success",
      message,
      nowIso,
    );

    return { refreshed };
  }).pipe(
    Effect.catchTag("ExternalCallError", (error) =>
      markJobFailed(input.db, "metadata_refresh", error, nowIso).pipe(
        Effect.catchAll(() => Effect.void),
        Effect.zipRight(
          appendSystemLog(
            input.db,
            "system.task.metadata_refresh.failed",
            "error",
            error.message,
            nowIso,
          ).pipe(Effect.catchAll(() => Effect.void)),
        ),
        Effect.zipRight(Effect.fail(error)),
      ),
    ),
    Effect.catchAll((cause) =>
      markJobFailed(input.db, "metadata_refresh", cause, nowIso).pipe(
        Effect.catchAll(() => Effect.void),
        Effect.zipRight(
          appendSystemLog(
            input.db,
            "system.task.metadata_refresh.failed",
            "error",
            formatJobFailureMessage(cause),
            nowIso,
          ).pipe(Effect.catchAll(() => Effect.void)),
        ),
        Effect.zipRight(Effect.fail(cause)),
      ),
    ),
  );
});
