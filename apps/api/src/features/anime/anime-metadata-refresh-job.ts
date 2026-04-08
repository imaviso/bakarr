import { eq } from "drizzle-orm";
import { Cause, Effect, Option } from "effect";

import type { AppDatabase } from "@/db/database.ts";
import { DatabaseError } from "@/db/database.ts";
import { anime } from "@/db/schema.ts";
import type { AnimeMetadataProviderService } from "@/features/anime/anime-metadata-provider-service.ts";
import { syncEpisodeMetadataEffect } from "@/features/anime/anime-episode-metadata-sync.ts";
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
import type { ExternalCallError } from "@/lib/effect-retry.ts";
import { markJobFailureOrFailWithError } from "@/lib/job-failure-support.ts";

type MetadataRefreshError = DatabaseError | ExternalCallError;

export const refreshMetadataForMonitoredAnimeEffect = Effect.fn(
  "AnimeService.refreshMetadataForMonitoredAnimeEffect",
)(function* (input: {
  metadataProvider: typeof AnimeMetadataProviderService.Service;
  db: AppDatabase;
  nowIso: () => Effect.Effect<string>;
}) {
  const { nowIso } = input;
  const markFailureAndAppendSystemLog = <E extends MetadataRefreshError>(
    error: E,
    message: string,
  ) =>
    markJobFailureOrFailWithError({
      error,
      job: "metadata_refresh",
      logAnnotations: { run_failure: error.message },
      logMessage: "Failed to record metadata refresh job failure",
      markFailed: markJobFailed(input.db, "metadata_refresh", error, nowIso),
    }).pipe(
      Effect.catchTag("JobFailurePersistenceError", () => Effect.void),
      Effect.zipRight(
        appendSystemLog(
          input.db,
          "system.task.metadata_refresh.failed",
          "error",
          message,
          nowIso,
        ).pipe(
          Effect.catchAllCause((appendLogCause) =>
            Effect.logError("Failed to append metadata refresh failure log").pipe(
              Effect.annotateLogs({
                append_log_cause: Cause.pretty(appendLogCause),
                job: "metadata_refresh",
                run_failure: error.message,
              }),
              Effect.zipRight(
                Effect.failCause(Cause.sequential(Cause.fail(error), appendLogCause)),
              ),
            ),
          ),
        ),
      ),
      Effect.zipRight(Effect.fail(error)),
    );

  const markFailureCauseAndAppendSystemLog = (cause: Cause.Cause<unknown>) => {
    const infrastructureError = new DatabaseError({
      cause,
      message: "Failed to refresh metadata",
    });

    return markJobFailureOrFailWithError({
      error: infrastructureError,
      job: "metadata_refresh",
      logAnnotations: { run_failure_cause: Cause.pretty(cause) },
      logMessage: "Failed to record metadata refresh infrastructure failure",
      markFailed: markJobFailed(input.db, "metadata_refresh", cause, nowIso),
    }).pipe(
      Effect.catchTag("JobFailurePersistenceError", () => Effect.void),
      Effect.zipRight(
        appendSystemLog(
          input.db,
          "system.task.metadata_refresh.failed",
          "error",
          formatJobFailureMessage(cause),
          nowIso,
        ).pipe(
          Effect.catchAllCause((appendLogCause) =>
            Effect.logError("Failed to append metadata refresh infrastructure failure log").pipe(
              Effect.annotateLogs({
                append_log_cause: Cause.pretty(appendLogCause),
                job: "metadata_refresh",
                run_failure_cause: Cause.pretty(cause),
              }),
              Effect.zipRight(
                Effect.failCause(Cause.sequential(Cause.fail(infrastructureError), appendLogCause)),
              ),
            ),
          ),
        ),
      ),
      Effect.zipRight(Effect.fail(infrastructureError)),
    );
  };

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
            metadataProvider: input.metadataProvider,
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
          yield* syncEpisodeMetadataEffect(input.db, animeRow.id, metadata?.episodes);
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
      markFailureAndAppendSystemLog(error, error.message),
    ),
    Effect.catchAllCause(markFailureCauseAndAppendSystemLog),
  );
});
