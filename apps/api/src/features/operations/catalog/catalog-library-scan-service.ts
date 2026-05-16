import { Context, Effect, Layer, Ref } from "effect";

import type { AppDatabase, DatabaseError } from "@/db/database.ts";
import { anime } from "@/db/schema.ts";
import { Database } from "@/db/database.ts";
import { EventBus } from "@/features/events/event-bus.ts";
import {
  OperationsPathError,
  OperationsInfrastructureError,
} from "@/features/operations/errors.ts";
import {
  markJobFailed,
  markJobStarted,
  markJobSucceeded,
} from "@/features/operations/shared/job-support.ts";
import { OperationsProgress } from "@/features/operations/tasks/operations-progress-service.ts";
import { FileSystem, type FileSystemShape } from "@/infra/filesystem/filesystem.ts";
import { tryDatabasePromise, type TryDatabasePromise } from "@/infra/effect/db.ts";
import { scanAnimeLibraryRow } from "@/features/operations/catalog/catalog-library-scan-row-support.ts";
import { ClockService, nowIsoFromClock } from "@/infra/clock.ts";
import { markJobFailureOrFailWithError } from "@/infra/job-failure-support.ts";

export interface CatalogLibraryScanServiceShape {
  readonly runLibraryScan: () => Effect.Effect<
    { matched: number; scanned: number },
    OperationsPathError | DatabaseError | OperationsInfrastructureError
  >;
}

function makeCatalogLibraryScanSupport(input: {
  db: AppDatabase;
  eventBus: typeof EventBus.Service;
  fs: FileSystemShape;
  nowIso: () => Effect.Effect<string>;
  publishLibraryScanProgress: (scanned: number) => Effect.Effect<void>;
  tryDatabasePromise: TryDatabasePromise;
}): CatalogLibraryScanServiceShape {
  const { nowIso } = input;
  const failAfterMarkingJobFailure = (
    cause: DatabaseError | OperationsInfrastructureError | OperationsPathError,
  ) =>
    markJobFailureOrFailWithError({
      error: cause,
      job: "library_scan",
      logAnnotations: { run_failure: cause.message },
      logMessage: "Failed to record library scan job failure",
      markFailed: markJobFailed(input.db, "library_scan", cause, nowIso),
    }).pipe(
      Effect.catchTag("JobFailurePersistenceError", () => Effect.void),
      Effect.zipRight(Effect.fail(cause)),
    );

  const runLibraryScan = Effect.fn("OperationsService.runLibraryScan")(
    function* () {
      yield* Effect.annotateCurrentSpan("job", "library_scan");
      yield* markJobStarted(input.db, "library_scan", nowIso);

      const animeRows = yield* input.tryDatabasePromise("Failed to run library scan", () =>
        input.db.select().from(anime),
      );
      yield* Effect.annotateCurrentSpan("animeCount", animeRows.length);
      const scannedRef = yield* Ref.make(0);
      const matchedRef = yield* Ref.make(0);

      yield* input.eventBus.publish({ type: "LibraryScanStarted" });

      yield* Effect.forEach(
        animeRows,
        (animeRow) =>
          scanAnimeLibraryRow(input.db, input.fs, animeRow).pipe(
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

      yield* markJobSucceeded(
        input.db,
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

export class CatalogLibraryScanService extends Context.Tag("@bakarr/api/CatalogLibraryScanService")<
  CatalogLibraryScanService,
  CatalogLibraryScanServiceShape
>() {}

export const CatalogLibraryScanServiceLive = Layer.effect(
  CatalogLibraryScanService,
  Effect.gen(function* () {
    const { db } = yield* Database;
    const eventBus = yield* EventBus;
    const fs = yield* FileSystem;
    const clock = yield* ClockService;
    const progress = yield* OperationsProgress;

    return makeCatalogLibraryScanSupport({
      db,
      eventBus,
      fs,
      nowIso: () => nowIsoFromClock(clock),
      publishLibraryScanProgress: progress.publishLibraryScanProgress,
      tryDatabasePromise,
    });
  }),
);
