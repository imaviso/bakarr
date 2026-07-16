import { Cause, Effect, Option } from "effect";

import { DatabaseError } from "@/db/database.ts";
import { MediaImageCacheService } from "@/features/media/metadata/media-image-cache-service.ts";
import type { MediaMetadataProviderService } from "@/features/media/metadata/media-metadata-provider-service.ts";
import { syncMediaMetadataEffect } from "@/features/media/metadata/media-metadata-sync.ts";
import { formatJobFailureMessage } from "@/infra/job-status.ts";
import { ExternalCallError } from "@/infra/effect/retry.ts";
import { markJobFailureOrFailWithError } from "@/infra/job-failure-support.ts";
import type { MediaRepositoryShape } from "@/features/media/shared/media-repository.ts";
import type { MediaUnitRepositoryShape } from "@/features/media/units/media-unit-repository.ts";
import type { BackgroundJobRepositoryShape } from "@/features/system/repository/background-job-repository.ts";
import type { SystemLogRepositoryShape } from "@/features/system/repository/log-repository.ts";

type MetadataRefreshError = DatabaseError | ExternalCallError;

export const refreshMetadataForMonitoredMediaEffect = Effect.fn(
  "MediaService.refreshMetadataForMonitoredMediaEffect",
)(function* (input: {
  imageCacheService: typeof MediaImageCacheService.Service;
  metadataProvider: typeof MediaMetadataProviderService.Service;
  backgroundJobRepository: BackgroundJobRepositoryShape;
  mediaRepository: MediaRepositoryShape;
  mediaUnitRepository: MediaUnitRepositoryShape;
  systemLogRepository: SystemLogRepositoryShape;
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
      markFailed: input.backgroundJobRepository.markFailed("metadata_refresh", error, nowIso),
    }).pipe(
      Effect.catchTag("JobFailurePersistenceError", () => Effect.void),
      Effect.zipRight(
        input.systemLogRepository
          .appendLog("system.task.metadata_refresh.failed", "error", message, nowIso)
          .pipe(
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
      markFailed: input.backgroundJobRepository.markFailed("metadata_refresh", cause, nowIso),
    }).pipe(
      Effect.catchTag("JobFailurePersistenceError", () => Effect.void),
      Effect.zipRight(
        input.systemLogRepository
          .appendLog(
            "system.task.metadata_refresh.failed",
            "error",
            formatJobFailureMessage(cause),
            nowIso,
          )
          .pipe(
            Effect.catchAllCause((appendLogCause) =>
              Effect.logError("Failed to append metadata refresh infrastructure failure log").pipe(
                Effect.annotateLogs({
                  append_log_cause: Cause.pretty(appendLogCause),
                  job: "metadata_refresh",
                  run_failure_cause: Cause.pretty(cause),
                }),
                Effect.zipRight(
                  Effect.failCause(
                    Cause.sequential(Cause.fail(infrastructureError), appendLogCause),
                  ),
                ),
              ),
            ),
          ),
      ),
      Effect.zipRight(Effect.fail(infrastructureError)),
    );
  };

  yield* input.backgroundJobRepository.markStarted("metadata_refresh", nowIso);
  yield* input.systemLogRepository.appendLog(
    "system.task.metadata_refresh.started",
    "info",
    "Metadata refresh started",
    nowIso,
  );

  return yield* Effect.gen(function* () {
    const monitoredMediaIds = yield* input.mediaRepository.listMonitoredMediaIds();
    let refreshed = 0;
    let skippedExternal = 0;

    yield* Effect.forEach(
      monitoredMediaIds,
      (mediaId) =>
        Effect.gen(function* () {
          const { metadata, nextAnimeRow } = yield* syncMediaMetadataEffect({
            imageCacheService: input.imageCacheService,
            metadataProvider: input.metadataProvider,
            mediaId,
            eventPublisher: Option.none(),
            mediaRepository: input.mediaRepository,
            systemLogRepository: input.systemLogRepository,
            nowIso,
          });

          yield* input.mediaUnitRepository.syncUnitSchedule(
            mediaId,
            nextAnimeRow,
            metadata?.futureAiringSchedule,
            nowIso,
          );
          yield* input.mediaUnitRepository.syncUnitMetadata(mediaId, metadata?.mediaUnits);
          refreshed += 1;
        }).pipe(
          Effect.catchTag("ExternalCallError", (error) =>
            Effect.logWarning(
              "Skipping metadata refresh for media after external call failure",
            ).pipe(
              Effect.annotateLogs({
                mediaId,
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

    yield* input.backgroundJobRepository.markSucceeded("metadata_refresh", message, nowIso);
    yield* input.systemLogRepository.appendLog(
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
