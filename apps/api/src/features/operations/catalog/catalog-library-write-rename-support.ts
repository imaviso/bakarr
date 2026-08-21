import { Effect, Either } from "effect";

import { brandMediaId, type Config } from "@packages/shared/index.ts";
import type { DatabaseError } from "@/db/database.ts";
import type { FileSystemShape } from "@/infra/filesystem/filesystem.ts";
import { isFileExistsError, isNotFoundError } from "@/infra/filesystem/fs-errors.ts";
import { EventBus } from "@/features/events/event-bus.ts";
import { buildRenamePreview } from "@/features/operations/library/library-import.ts";
import { DomainPathError } from "@/features/errors.ts";
import type { MediaNotFoundError } from "@/features/media/errors.ts";
import { MediaRepository } from "@/features/media/shared/media-repository.ts";
import type { MediaUnitRepositoryShape } from "@/features/media/units/media-unit-repository.ts";

const fileExists = Effect.fn("Operations.renameFileExists")(function* (
  fs: FileSystemShape,
  path: string,
) {
  return yield* fs.stat(path).pipe(
    Effect.as(true),
    Effect.catchTag("FileSystemError", (error) =>
      isNotFoundError(error) ? Effect.succeed(false) : Effect.fail(error),
    ),
    Effect.mapError(
      (cause) =>
        new DomainPathError({
          cause,
          message: `Failed to inspect destination file: ${path}`,
        }),
    ),
  );
});

/**
 * Atomically reserve an empty destination file (`wx` open fails on any
 * existing path), then let the rename land on top of our own reservation.
 * A bare stat-then-rename would silently overwrite a file created between
 * the check and the rename.
 */
const claimDestination = Effect.fn("Operations.claimRenameDestination")(function* (
  fs: FileSystemShape,
  path: string,
) {
  return yield* fs.openFile(path, { exclusive: true, read: false, write: true }).pipe(
    Effect.mapError((cause) =>
      isFileExistsError(cause)
        ? new DomainPathError({
            cause,
            message: `Destination already exists: ${path}`,
          })
        : new DomainPathError({
            cause,
            message: `Failed to claim destination file: ${path}`,
          }),
    ),
    Effect.scoped,
    Effect.asVoid,
  );
});

export interface RenameLibraryFilesInput {
  readonly eventBus: typeof EventBus.Service;
  readonly fs: FileSystemShape;
  readonly mediaRepository: typeof MediaRepository.Service;
  readonly mediaUnitRepository: MediaUnitRepositoryShape;
  readonly runtimeConfig: Config;
  readonly mediaId: number;
}

export const renameLibraryFiles = Effect.fn("Operations.renameLibraryFiles")((
  input: RenameLibraryFilesInput,
): Effect.Effect<
  { failed: number; failures: string[]; renamed: number },
  DatabaseError | MediaNotFoundError
> => {
  const { eventBus, fs, mediaRepository, mediaUnitRepository, runtimeConfig, mediaId } = input;
  return Effect.gen(function* () {
    const animeRow = yield* mediaRepository.getMediaRow(mediaId);
    const preview = yield* buildRenamePreview(mediaId, runtimeConfig, mediaRepository);

    yield* eventBus.publish({
      type: "RenameStarted",
      payload: {
        media_id: brandMediaId(mediaId),
        title: animeRow.titleRomaji,
      },
    });

    let renamed = 0;
    const failures: string[] = [];

    // Conflict detection before any rename: two groups resolving to the same
    // destination, or a destination that already exists on disk, route those
    // items to failures instead of renaming.
    const newPathCounts = new Map<string, number>();
    for (const item of preview) {
      newPathCounts.set(item.new_path, (newPathCounts.get(item.new_path) ?? 0) + 1);
    }

    for (const item of preview) {
      const unitNumbers = item.unit_numbers?.length ? item.unit_numbers : [item.unit_number];

      if ((newPathCounts.get(item.new_path) ?? 0) > 1) {
        failures.push(`Multiple files resolve to ${item.new_path}`);
        continue;
      }

      const destinationExists = yield* fileExists(fs, item.new_path).pipe(Effect.either);

      if (Either.isLeft(destinationExists)) {
        failures.push(
          `Cannot inspect destination ${item.new_path}: ${
            destinationExists.left instanceof Error
              ? destinationExists.left.message
              : String(destinationExists.left)
          }`,
        );
        continue;
      }

      if (destinationExists.right) {
        failures.push(`Destination already exists: ${item.new_path}`);
        continue;
      }

      const claimResult = yield* claimDestination(fs, item.new_path).pipe(Effect.either);

      if (Either.isLeft(claimResult)) {
        failures.push(claimResult.left.message);
        continue;
      }

      const result = yield* fs.rename(item.current_path, item.new_path).pipe(
        Effect.mapError(
          (cause) =>
            new DomainPathError({
              cause,
              message: `Failed to rename file ${item.current_path}`,
            }),
        ),
        Effect.zipRight(
          mediaUnitRepository.updateUnitFilePaths(mediaId, unitNumbers, item.new_path).pipe(
            Effect.catchTag("DatabaseError", (error) =>
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
        // Claim left an empty file at destination; remove it so future
        // renames don't see a phantom "already exists" and to avoid junk.
        yield* fs.remove(item.new_path).pipe(Effect.ignore);
        failures.push(result.left instanceof Error ? result.left.message : String(result.left));
      }
    }

    yield* eventBus.publish({
      type: "RenameFinished",
      payload: {
        media_id: brandMediaId(mediaId),
        count: renamed,
        title: animeRow.titleRomaji,
      },
    });

    return {
      failed: failures.length,
      failures,
      renamed,
    };
  });
});
