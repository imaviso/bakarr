import { Effect, Ref, Stream } from "effect";

import type { AppDatabase, DatabaseError } from "../../db/database.ts";
import { DatabaseError as DatabaseErrorTag } from "../../db/database.ts";
import { anime } from "../../db/schema.ts";
import { type FileSystemShape } from "../../lib/filesystem.ts";
import { classifyMediaArtifact, parseFileSourceIdentity } from "../../lib/media-identity.ts";
import { EventBus } from "../events/event-bus.ts";
import { OperationsPathError } from "./errors.ts";
import { markJobFailed, markJobStarted, markJobSucceeded } from "./job-support.ts";
import { upsertEpisodeFilesAtomic } from "./download-support.ts";
import { scanVideoFilesStream } from "./file-scanner.ts";
import type { TryDatabasePromise } from "./service-support.ts";

export interface CatalogLibraryScanSupportShape {
  readonly runLibraryScan: () => Effect.Effect<
    { matched: number; scanned: number },
    OperationsPathError | DatabaseError
  >;
}

export function makeCatalogLibraryScanSupport(input: {
  db: AppDatabase;
  fs: FileSystemShape;
  eventBus: typeof EventBus.Service;
  nowIso?: () => Effect.Effect<string>;
  publishLibraryScanProgress: (scanned: number) => Effect.Effect<void>;
  tryDatabasePromise: TryDatabasePromise;
  dbError: (message: string) => (cause: unknown) => DatabaseError;
}): CatalogLibraryScanSupportShape {
  const nowIso = input.nowIso ?? (() => Effect.sync(() => new Date().toISOString()));
  const runLibraryScan = Effect.fn("OperationsService.runLibraryScan")(function* () {
    yield* markJobStarted(input.db, "library_scan", nowIso);

    return yield* Effect.gen(function* () {
      const animeRows = yield* input.tryDatabasePromise("Failed to run library scan", () =>
        input.db.select().from(anime),
      );
      const scannedRef = yield* Ref.make(0);
      const matchedRef = yield* Ref.make(0);

      yield* input.eventBus.publish({ type: "LibraryScanStarted" });

      yield* Effect.forEach(
        animeRows,
        (animeRow) =>
          Effect.gen(function* () {
            const { scannedFiles, matchedFiles } = yield* scanVideoFilesStream(
              input.fs,
              animeRow.rootFolder,
            ).pipe(
              Stream.mapError(
                () =>
                  new OperationsPathError({
                    message: `Anime library folder is inaccessible: ${animeRow.rootFolder}`,
                  }),
              ),
              Stream.runFoldEffect({ matchedFiles: 0, scannedFiles: 0 }, (counts, file) =>
                Effect.gen(function* () {
                  const classification = classifyMediaArtifact(file.path, file.name);
                  if (classification.kind === "extra" || classification.kind === "sample") {
                    return {
                      matchedFiles: counts.matchedFiles,
                      scannedFiles: counts.scannedFiles + 1,
                    };
                  }

                  const parsed = parseFileSourceIdentity(file.path);
                  const identity = parsed.source_identity;

                  if (!identity || identity.scheme === "daily") {
                    return {
                      matchedFiles: counts.matchedFiles,
                      scannedFiles: counts.scannedFiles + 1,
                    };
                  }

                  const episodeNumbers = identity.episode_numbers;
                  if (episodeNumbers.length === 0) {
                    return {
                      matchedFiles: counts.matchedFiles,
                      scannedFiles: counts.scannedFiles + 1,
                    };
                  }

                  yield* upsertEpisodeFilesAtomic(
                    input.db,
                    animeRow.id,
                    episodeNumbers,
                    file.path,
                  ).pipe(
                    Effect.mapError(
                      (cause) =>
                        new DatabaseErrorTag({
                          message: "Failed to run library scan",
                          cause,
                        }),
                    ),
                  );

                  return {
                    matchedFiles: counts.matchedFiles + episodeNumbers.length,
                    scannedFiles: counts.scannedFiles + 1,
                  };
                }),
              ),
            );

            const newScanned = yield* Ref.updateAndGet(scannedRef, (n) => n + scannedFiles);
            yield* Ref.update(matchedRef, (n) => n + matchedFiles);
            yield* input.publishLibraryScanProgress(newScanned);
          }),
        { concurrency: 5 },
      );

      const scanned = yield* Ref.get(scannedRef);
      const matched = yield* Ref.get(matchedRef);

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
    }).pipe(
      Effect.catchAll((cause) =>
        markJobFailed(input.db, "library_scan", cause, nowIso).pipe(
          Effect.zipRight(
            cause instanceof DatabaseErrorTag || cause instanceof OperationsPathError
              ? Effect.fail(cause)
              : Effect.fail(input.dbError("Failed to run library scan")(cause)),
          ),
        ),
      ),
    );
  });

  return { runLibraryScan };
}
