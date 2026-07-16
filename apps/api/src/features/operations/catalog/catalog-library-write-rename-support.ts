import { Effect, Either } from "effect";

import { brandMediaId, type Config } from "@packages/shared/index.ts";
import type { DatabaseError } from "@/db/database.ts";
import type { FileSystemShape } from "@/infra/filesystem/filesystem.ts";
import { EventBus } from "@/features/events/event-bus.ts";
import { buildRenamePreview } from "@/features/operations/library/library-import.ts";
import { DomainPathError } from "@/features/errors.ts";
import type { MediaNotFoundError } from "@/features/media/errors.ts";
import { MediaRepository } from "@/features/media/shared/media-repository.ts";
import type { MediaUnitRepositoryShape } from "@/features/media/units/media-unit-repository.ts";

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

    for (const item of preview) {
      const unitNumbers = item.unit_numbers?.length ? item.unit_numbers : [item.unit_number];
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
