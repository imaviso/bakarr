import { eq } from "drizzle-orm";
import { Cause, Effect, Option } from "effect";

import type { AppDatabase } from "@/db/database.ts";
import { DatabaseError } from "@/db/database.ts";
import { media } from "@/db/schema.ts";
import { AnimeImageCacheService } from "@/features/media/metadata/media-image-cache-service.ts";
import type { AnimeMetadataProviderService } from "@/features/media/metadata/media-metadata-provider-service.ts";
import { syncEpisodeMetadataEffect } from "@/features/media/units/media-unit-metadata-sync.ts";
import { syncEpisodeScheduleEffect } from "@/features/media/units/media-unit-schedule-sync.ts";
import { syncAnimeMetadataEffect } from "@/features/media/metadata/media-metadata-sync.ts";
import { tryDatabasePromise } from "@/infra/effect/db.ts";
import {
  formatJobFailureMessage,
  markJobFailed,
  markJobStarted,
  markJobSucceeded,
} from "@/infra/job-status.ts";
import { appendSystemLog } from "@/features/system/support.ts";
import { ExternalCallError } from "@/infra/effect/retry.ts";
import { markJobFailureOrFailWithError } from "@/infra/job-failure-support.ts";

type MetadataRefreshError = DatabaseError | ExternalCallError;

export const refreshMetadataForMonitoredAnimeEffect = Effect.fn(
  "AnimeService.refreshMetadataForMonitoredAnimeEffect",
)(function* (input: {
  imageCacheService: typeof AnimeImageCacheService.Service;
  metadataProvider: typeof AnimeMetadataProviderService.Service;
  db: AppDatabase;
  nowIso: () => Effect.Effect<string, MetadataRefreshError>;
  refreshConcurrency: number;
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
    const monitoredAnime = yield* tryDatabasePromise("Failed to refresh metadata", () =>
      input.db.select({ id: media.id }).from(media).where(eq(media.monitored, true)),
    );
    let refreshed = 0;
    let skippedExternal = 0;

    yield* Effect.forEach(
      monitoredAnime,
      (monitored) =>
        Effect.gen(function* () {
          const { metadata, nextAnimeRow } = yield* syncAnimeMetadataEffect({
            imageCacheService: input.imageCacheService,
            metadataProvider: input.metadataProvider,
            mediaId: monitored.id,
            db: input.db,
            eventPublisher: Option.none(),
            nowIso,
          });

          yield* syncEpisodeScheduleEffect(
            input.db,
            monitored.id,
            nextAnimeRow,
            metadata?.futureAiringSchedule,
            nowIso,
          );
          yield* syncEpisodeMetadataEffect(input.db, monitored.id, metadata?.mediaUnits);
          refreshed += 1;
        }).pipe(
          Effect.catchTag("ExternalCallError", (error) =>
            Effect.logWarning(
              "Skipping metadata refresh for media after external call failure",
            ).pipe(
              Effect.annotateLogs({
                mediaId: monitored.id,
                externalOperation: error.operation,
              }),
              Effect.tap(() =>
                Effect.sync(() => {
                  skippedExternal += 1;
                }),
              ),
            ),
          ),
        ),
      { concurrency: input.refreshConcurrency, discard: true },
    );

    const message =
      skippedExternal === 0
        ? `Refreshed ${refreshed} monitored media`
        : `Refreshed ${refreshed} monitored media (${skippedExternal} skipped due external failures)`;

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
    Effect.catchAllCause((cause) => {
      const failure = Cause.failureOption(cause);

      if (Option.isSome(failure)) {
        if (failure.value instanceof ExternalCallError || failure.value instanceof DatabaseError) {
          return markFailureAndAppendSystemLog(failure.value, failure.value.message);
        }
      }

      return markFailureCauseAndAppendSystemLog(cause);
    }),
  );
});
