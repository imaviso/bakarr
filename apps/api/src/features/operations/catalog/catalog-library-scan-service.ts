import { Effect, Ref } from "effect";

import type { DatabaseError } from "@/db/database.ts";
import { EventBus } from "@/features/events/event-bus.ts";
import { DomainPathError, InfrastructureError } from "@/features/errors.ts";
import {
  MediaRepository,
  type MediaRepositoryShape,
} from "@/features/media/shared/media-repository.ts";
import { MediaUnitRepository } from "@/features/media/units/media-unit-repository.ts";
import { OperationsProgress } from "@/features/operations/tasks/operations-progress-service.ts";
import { FileSystem, type FileSystemShape } from "@/infra/filesystem/filesystem.ts";
import { scanMediaLibraryRow } from "@/features/operations/catalog/catalog-library-scan-row-support.ts";
import { nowIso as currentNowIso } from "@/infra/time.ts";
import { markJobFailureOrFailWithError } from "@/infra/job-failure-support.ts";
import {
  BackgroundJobRepository,
  type BackgroundJobRepositoryShape,
} from "@/features/system/repository/background-job-repository.ts";

export interface CatalogLibraryScanServiceShape {
  readonly runLibraryScan: () => Effect.Effect<
    { matched: number; scanned: number },
    DomainPathError | DatabaseError | InfrastructureError
  >;
}

function makeCatalogLibraryScanSupport(input: {
  backgroundJobRepository: BackgroundJobRepositoryShape;
  eventBus: typeof EventBus.Service;
  fs: FileSystemShape;
  mediaReadRepository: MediaRepositoryShape;
  mediaUnitRepository: import("@/features/media/units/media-unit-repository.ts").MediaUnitRepositoryShape;
  nowIso: () => Effect.Effect<string>;
  publishLibraryScanProgress: (scanned: number) => Effect.Effect<void>;
}): CatalogLibraryScanServiceShape {
  const { nowIso } = input;
  const failAfterMarkingJobFailure = (
    cause: DatabaseError | InfrastructureError | DomainPathError,
  ) =>
    markJobFailureOrFailWithError({
      error: cause,
      job: "library_scan",
      logAnnotations: { run_failure: cause.message },
      logMessage: "Failed to record library scan job failure",
      markFailed: input.backgroundJobRepository.markFailed("library_scan", cause, nowIso),
    }).pipe(
      Effect.catchTag("JobFailurePersistenceError", () => Effect.void),
      Effect.zipRight(Effect.fail(cause)),
    );

  const runLibraryScan = Effect.fn("CatalogLibraryScan.runLibraryScan")(
    function* () {
      yield* Effect.annotateCurrentSpan("job", "library_scan");
      yield* input.backgroundJobRepository.markStarted("library_scan", nowIso);

      const animeRows = yield* input.mediaReadRepository.listMediaRows({
        limit: Number.MAX_SAFE_INTEGER,
        offset: 0,
      });
      yield* Effect.annotateCurrentSpan("mediaCount", animeRows.length);
      const scannedRef = yield* Ref.make(0);
      const matchedRef = yield* Ref.make(0);

      yield* input.eventBus.publish({ type: "LibraryScanStarted" });

      yield* Effect.forEach(
        animeRows,
        (animeRow) =>
          scanMediaLibraryRow(input.mediaUnitRepository, input.fs, animeRow).pipe(
            Effect.tap(({ scannedFiles, matchedFiles }) =>
              Effect.gen(function* () {
                const newScanned = yield* Ref.updateAndGet(scannedRef, (n) => n + scannedFiles);
                yield* Ref.update(matchedRef, (n) => n + matchedFiles);
                yield* input.publishLibraryScanProgress(newScanned);
              }),
            ),
          ),
        { concurrency: 5 },
      );

      const scanned = yield* Ref.get(scannedRef);
      const matched = yield* Ref.get(matchedRef);
      yield* Effect.annotateCurrentSpan("scannedFiles", scanned);
      yield* Effect.annotateCurrentSpan("matchedFiles", matched);

      yield* input.backgroundJobRepository.markSucceeded(
        "library_scan",
        `Scanned ${scanned} file(s), matched ${matched}`,
        nowIso,
      );
      yield* input.eventBus.publish({
        type: "LibraryScanFinished",
        payload: { matched, scanned },
      });

      return { matched, scanned };
    },
    Effect.catchTags({
      DatabaseError: failAfterMarkingJobFailure,
      DomainPathError: failAfterMarkingJobFailure,
      InfrastructureError: failAfterMarkingJobFailure,
    }),
  );

  return { runLibraryScan };
}

export class CatalogLibraryScanService extends Effect.Service<CatalogLibraryScanService>()(
  "@bakarr/api/CatalogLibraryScanService",
  {
    effect: Effect.gen(function* () {
      const backgroundJobRepository = yield* BackgroundJobRepository;
      const eventBus = yield* EventBus;
      const fs = yield* FileSystem;
      const mediaReadRepository = yield* MediaRepository;
      const mediaUnitRepository = yield* MediaUnitRepository;
      const progress = yield* OperationsProgress;

      return makeCatalogLibraryScanSupport({
        backgroundJobRepository,
        eventBus,
        fs,
        mediaReadRepository,
        mediaUnitRepository,
        nowIso: currentNowIso,
        publishLibraryScanProgress: progress.publishLibraryScanProgress,
      });
    }),
    dependencies: [BackgroundJobRepository.Default, MediaRepository.Default],
  },
) {}

export const CatalogLibraryScanServiceLive = CatalogLibraryScanService.Default;
