import { Effect, Ref, Stream } from "effect";

import type { DatabaseError } from "@/db/database.ts";
import { media } from "@/db/schema.ts";
import { EventBus } from "@/features/events/event-bus.ts";
import { DomainPathError, InfrastructureError } from "@/features/errors.ts";
import {
  MediaRepository,
  type MediaRepositoryShape,
} from "@/features/media/shared/media-repository.ts";
import { MediaUnitRepository } from "@/features/media/units/media-unit-repository.ts";
import type { MediaUnitRepositoryShape } from "@/features/media/units/media-unit-repository.ts";
import { OperationsProgress } from "@/features/operations/tasks/operations-progress-service.ts";
import { FileSystem, type FileSystemShape } from "@/infra/filesystem/filesystem.ts";
import {
  countLibraryScanFile,
  type LibraryScanCounts,
} from "@/features/operations/catalog/catalog-library-scan-file-support.ts";
import { scanVideoFilesStream } from "@/features/operations/import-scan/file-scanner.ts";
import {
  BackgroundJobRunner,
  type BackgroundJobRunnerShape,
} from "@/background/background-job-runner.ts";

export interface CatalogLibraryScanServiceShape {
  readonly runLibraryScan: () => Effect.Effect<
    { matched: number; scanned: number },
    DomainPathError | DatabaseError | InfrastructureError
  >;
}

const scanMediaLibraryRow = Effect.fn("CatalogLibraryScan.scanMediaLibraryRow")(function* (
  mediaUnitRepository: MediaUnitRepositoryShape,
  fs: FileSystemShape,
  animeRow: typeof media.$inferSelect,
) {
  return yield* scanVideoFilesStream(fs, animeRow.rootFolder).pipe(
    Stream.mapError(
      (cause) =>
        new DomainPathError({
          cause,
          message: `Media library folder is inaccessible: ${animeRow.rootFolder}`,
        }),
    ),
    Stream.runFoldEffect(
      { matchedFiles: 0, scannedFiles: 0 } satisfies LibraryScanCounts,
      (counts, file) =>
        countLibraryScanFile(mediaUnitRepository, {
          mediaId: animeRow.id,
          mediaKind: animeRow.mediaKind,
          counts,
          file,
        }),
    ),
  );
});

function makeCatalogLibraryScanSupport(input: {
  backgroundJobRunner: BackgroundJobRunnerShape;
  eventBus: typeof EventBus.Service;
  fs: FileSystemShape;
  mediaRepository: MediaRepositoryShape;
  mediaUnitRepository: MediaUnitRepositoryShape;
  publishLibraryScanProgress: (scanned: number) => Effect.Effect<void>;
}): CatalogLibraryScanServiceShape {
  const runLibraryScan = Effect.fn("CatalogLibraryScan.runLibraryScan")(function* () {
    return yield* input.backgroundJobRunner.runJob(
      "library_scan",
      Effect.gen(function* () {
        yield* Effect.annotateCurrentSpan("job", "library_scan");

        const animeRows = yield* input.mediaRepository.listMediaRows({
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

        yield* input.eventBus.publish({
          type: "LibraryScanFinished",
          payload: { matched, scanned },
        });

        return { matched, scanned };
      }),
      ({ matched, scanned }) => `Scanned ${scanned} file(s), matched ${matched}`,
    );
  });

  return { runLibraryScan };
}

export class CatalogLibraryScanService extends Effect.Service<CatalogLibraryScanService>()(
  "@bakarr/api/CatalogLibraryScanService",
  {
    effect: Effect.gen(function* () {
      const backgroundJobRunner = yield* BackgroundJobRunner;
      const eventBus = yield* EventBus;
      const fs = yield* FileSystem;
      const mediaRepository = yield* MediaRepository;
      const mediaUnitRepository = yield* MediaUnitRepository;
      const progress = yield* OperationsProgress;

      return makeCatalogLibraryScanSupport({
        backgroundJobRunner,
        eventBus,
        fs,
        mediaRepository,
        mediaUnitRepository,
        publishLibraryScanProgress: progress.publishLibraryScanProgress,
      });
    }),
    // FS + OperationsProgress provided by ops feature layer.
    dependencies: [
      BackgroundJobRunner.Default,
      EventBus.Default,
      MediaRepository.Default,
      MediaUnitRepository.Default,
    ],
  },
) {}

export const CatalogLibraryScanServiceLive = CatalogLibraryScanService.Default;
