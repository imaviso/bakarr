import { and, eq, inArray } from "drizzle-orm";
import { Effect, Either } from "effect";

import type { Config } from "@packages/shared/index.ts";
import type { AppDatabase, DatabaseError } from "@/db/database.ts";
import { episodes } from "@/db/schema.ts";
import type { FileSystemShape } from "@/infra/filesystem/filesystem.ts";
import { EventBus } from "@/features/events/event-bus.ts";
import { buildRenamePreview } from "@/features/operations/library-import.ts";
import { OperationsAnimeNotFoundError, OperationsPathError } from "@/features/operations/errors.ts";
import { requireAnime } from "@/features/operations/repository/anime-repository.ts";
import type { TryDatabasePromise } from "@/infra/effect/db.ts";

export interface RenameLibraryFilesInput {
  readonly db: AppDatabase;
  readonly eventBus: typeof EventBus.Service;
  readonly fs: FileSystemShape;
  readonly runtimeConfig: Config;
  readonly tryDatabasePromise: TryDatabasePromise;
  readonly animeId: number;
}

export const renameLibraryFiles = Effect.fn("Operations.renameLibraryFiles")((
  input: RenameLibraryFilesInput,
): Effect.Effect<
  { failed: number; failures: string[]; renamed: number },
  DatabaseError | OperationsAnimeNotFoundError
> => {
  const { db, eventBus, fs, runtimeConfig, tryDatabasePromise, animeId } = input;
  return Effect.gen(function* () {
    const animeRow = yield* requireAnime(db, animeId);
    const preview = yield* buildRenamePreview(db, animeId, runtimeConfig);

    yield* eventBus.publish({
      type: "RenameStarted",
      payload: {
        anime_id: animeId,
        title: animeRow.titleRomaji,
      },
    });

    let renamed = 0;
    const failures: string[] = [];

    for (const item of preview) {
      const result = yield* fs.rename(item.current_path, item.new_path).pipe(
        Effect.mapError(
          (cause) =>
            new OperationsPathError({
              cause,
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
        anime_id: animeId,
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
