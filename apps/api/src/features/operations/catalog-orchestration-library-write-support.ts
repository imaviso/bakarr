import { and, eq, inArray } from "drizzle-orm";
import { Effect, Either } from "effect";

import type { ImportResult, RenameResult } from "../../../../../packages/shared/src/index.ts";
import type { AppDatabase } from "../../db/database.ts";
import { DatabaseError } from "../../db/database.ts";
import { episodes } from "../../db/schema.ts";
import type { FileSystemShape } from "../../lib/filesystem.ts";
import type { MediaProbeShape } from "../../lib/media-probe.ts";
import { EventBus } from "../events/event-bus.ts";
import { upsertEpisodeFilesAtomic } from "./download-support.ts";
import { OperationsPathError } from "./errors.ts";
import { buildRenamePreview } from "./library-import.ts";
import {
  buildEpisodeFilenamePlan,
  hasMissingLocalMediaNamingFields,
  selectNamingFormat,
} from "./naming-support.ts";
import { currentImportMode, currentNamingSettings, requireAnime } from "./repository.ts";
import type { TryDatabasePromise } from "../../lib/effect-db.ts";

export type CatalogLibraryWriteSupportShape = ReturnType<typeof makeCatalogLibraryWriteSupport>;

export function makeCatalogLibraryWriteSupport(input: {
  db: AppDatabase;
  dbError: (message: string) => (cause: unknown) => DatabaseError;
  eventBus: typeof EventBus.Service;
  fs: FileSystemShape;
  mediaProbe: MediaProbeShape;
  tryDatabasePromise: TryDatabasePromise;
}) {
  const { db, dbError, eventBus, fs, mediaProbe, tryDatabasePromise } = input;

  const renameFiles = Effect.fn("OperationsService.renameFiles")(function* (animeId: number) {
    const animeRow = yield* requireAnime(db, animeId);
    const preview = yield* buildRenamePreview(db, animeId);
    let renamed = 0;
    const failures: string[] = [];

    for (const item of preview) {
      const result = yield* fs.rename(item.current_path, item.new_path).pipe(
        Effect.mapError(
          () =>
            new OperationsPathError({
              message: `Failed to rename file ${item.current_path}`,
            }),
        ),
        Effect.zipRight(
          tryDatabasePromise("Failed to rename files", () =>
            db
              .update(episodes)
              .set({ filePath: item.new_path })
              .where(
                and(
                  eq(episodes.animeId, animeId),
                  item.episode_numbers?.length
                    ? inArray(episodes.number, item.episode_numbers)
                    : eq(episodes.number, item.episode_number),
                ),
              ),
          ).pipe(
            Effect.catchAll((error) =>
              fs.rename(item.new_path, item.current_path).pipe(
                Effect.catchTag("FileSystemError", (fsError) =>
                  Effect.logWarning("Failed to rollback rename after DB error").pipe(
                    Effect.annotateLogs({
                      current_path: item.current_path,
                      error: String(fsError),
                      new_path: item.new_path,
                    }),
                    Effect.asVoid,
                  ),
                ),
                Effect.zipRight(Effect.fail(error)),
              ),
            ),
          ),
        ),
        Effect.either,
      );

      if (Either.isRight(result)) {
        renamed += 1;
      } else {
        failures.push(result.left instanceof Error ? result.left.message : String(result.left));
      }
    }

    yield* eventBus.publish({
      type: "RenameFinished",
      payload: {
        anime_id: animeId,
        count: renamed,
        title: animeRow.titleRomaji,
      },
    });

    return {
      failed: failures.length,
      failures,
      renamed,
    } satisfies RenameResult;
  });

  const importFilesBase = Effect.fn("OperationsService.importFilesBase")(function* (
    files: readonly {
      source_path: string;
      anime_id: number;
      episode_number: number;
      episode_numbers?: readonly number[];
      season?: number;
      source_metadata?: import("../../../../../packages/shared/src/index.ts").DownloadSourceMetadata;
    }[],
  ) {
    const importedFiles: ImportResult["imported_files"] = [];
    const failedFiles: ImportResult["failed_files"] = [];

    const importMode = yield* currentImportMode(db);
    const namingSettings = yield* currentNamingSettings(db);

    const importSingleFile = Effect.fn("operations.import.file")(function* (
      file: (typeof files)[number],
    ) {
      const resolvedSource = yield* fs.realPath(file.source_path).pipe(
        Effect.mapError(
          () =>
            new OperationsPathError({
              message: `Source path is inaccessible: ${file.source_path}`,
            }),
        ),
      );

      const animeRow = yield* requireAnime(db, file.anime_id);
      const namingFormat = selectNamingFormat(animeRow, namingSettings);
      const allEpisodeNumbers = file.episode_numbers?.length
        ? file.episode_numbers
        : [file.episode_number];
      const episodeRows = yield* tryDatabasePromise("Failed to import files", () =>
        db
          .select({ aired: episodes.aired, title: episodes.title })
          .from(episodes)
          .where(
            and(
              eq(episodes.animeId, file.anime_id),
              inArray(episodes.number, allEpisodeNumbers as number[]),
            ),
          ),
      );
      const extension = file.source_path.includes(".")
        ? file.source_path.slice(file.source_path.lastIndexOf("."))
        : ".mkv";
      const initialNamingPlan = buildEpisodeFilenamePlan({
        animeRow,
        downloadSourceMetadata: file.source_metadata,
        episodeNumbers: allEpisodeNumbers,
        episodeRows,
        filePath: file.source_path,
        namingFormat,
        preferredTitle: namingSettings.preferredTitle,
        season: file.season,
      });
      const localMediaMetadata = hasMissingLocalMediaNamingFields(initialNamingPlan.missingFields)
        ? yield* mediaProbe
            .probeVideoFile(file.source_path)
            .pipe(
              Effect.map((probeResult) =>
                probeResult._tag === "MediaProbeMetadataFound" ? probeResult.metadata : undefined,
              ),
            )
        : undefined;
      const namingPlan = localMediaMetadata
        ? buildEpisodeFilenamePlan({
            animeRow,
            downloadSourceMetadata: file.source_metadata,
            episodeNumbers: allEpisodeNumbers,
            episodeRows,
            filePath: file.source_path,
            localMediaMetadata,
            namingFormat,
            preferredTitle: namingSettings.preferredTitle,
            season: file.season,
          })
        : initialNamingPlan;
      const destinationBaseName = namingPlan.baseName;
      const destination = `${animeRow.rootFolder.replace(/\/$/, "")}/${destinationBaseName}${extension}`;

      yield* fs.mkdir(animeRow.rootFolder, { recursive: true }).pipe(
        Effect.mapError(
          () =>
            new OperationsPathError({
              message: `Failed to create or access destination folder ${animeRow.rootFolder}`,
            }),
        ),
      );

      if (importMode === "move") {
        yield* fs.rename(resolvedSource, destination).pipe(
          Effect.mapError(
            () =>
              new OperationsPathError({
                message: `Failed to move file into library: ${file.source_path}`,
              }),
          ),
        );
      } else {
        yield* fs.copyFile(resolvedSource, destination).pipe(
          Effect.mapError(
            () =>
              new OperationsPathError({
                message: `Failed to copy file into library: ${file.source_path}`,
              }),
          ),
        );
      }

      const dbResult = yield* upsertEpisodeFilesAtomic(
        db,
        file.anime_id,
        allEpisodeNumbers,
        destination,
      ).pipe(
        Effect.mapError(
          (cause) =>
            new DatabaseError({
              cause,
              message: "Failed to import episode files atomically",
            }),
        ),
        Effect.either,
      );

      if (Either.isLeft(dbResult)) {
        const rollbackEffect =
          importMode === "move" ? fs.rename(destination, resolvedSource) : fs.remove(destination);

        yield* rollbackEffect.pipe(
          Effect.catchTag("FileSystemError", (error) =>
            Effect.logWarning("Failed to rollback filesystem after DB error").pipe(
              Effect.annotateLogs({
                destination_path: destination,
                source_path: file.source_path,
                error: String(error),
              }),
            ),
          ),
        );

        return yield* dbResult.left;
      }

      importedFiles.push({
        anime_id: file.anime_id,
        destination_path: destination,
        episode_number: file.episode_number,
        episode_numbers: file.episode_numbers ? [...file.episode_numbers] : undefined,
        naming_fallback_used: namingPlan.fallbackUsed || undefined,
        naming_format_used: namingPlan.formatUsed,
        naming_metadata_snapshot: namingPlan.metadataSnapshot,
        naming_missing_fields:
          namingPlan.missingFields.length > 0 ? [...namingPlan.missingFields] : undefined,
        naming_warnings: namingPlan.warnings.length > 0 ? [...namingPlan.warnings] : undefined,
        source_path: file.source_path,
      });
    });

    for (const file of files) {
      const result = yield* importSingleFile(file).pipe(Effect.either);

      if (Either.isLeft(result)) {
        failedFiles.push({
          source_path: file.source_path,
          error: result.left instanceof Error ? result.left.message : String(result.left),
        });
      }
    }

    yield* eventBus.publish({
      type: "ImportFinished",
      payload: {
        count: files.length,
        imported: importedFiles.length,
        failed: failedFiles.length,
      },
    });

    return {
      imported: importedFiles.length,
      failed: failedFiles.length,
      imported_files: importedFiles,
      failed_files: failedFiles,
    } satisfies ImportResult;
  });

  const importFiles = Effect.fn("OperationsService.importFiles")(function* (
    files: readonly {
      source_path: string;
      anime_id: number;
      episode_number: number;
      episode_numbers?: readonly number[];
      season?: number;
    }[],
  ) {
    return yield* importFilesBase(files).pipe(
      Effect.mapError((error) =>
        error instanceof DatabaseError ? error : dbError("Failed to import files")(error),
      ),
    );
  });

  return { importFiles, renameFiles };
}
