import { Effect } from "effect";

import type { FileSystemShape } from "@/infra/filesystem/filesystem.ts";
import { isWithinPathRoot } from "@/infra/filesystem/filesystem.ts";
import { MediaPathError } from "@/features/media/errors.ts";

export const loadAnimeRoot = Effect.fn("AnimeFilePathPolicy.loadAnimeRoot")(function* (
  fs: FileSystemShape,
  rootFolder: string,
) {
  return yield* fs.realPath(rootFolder).pipe(
    Effect.mapError(
      (cause) =>
        new MediaPathError({
          cause,
          message: "Media root folder does not exist",
        }),
    ),
  );
});

export const validateEpisodeFilePath = Effect.fn("AnimeFilePathPolicy.validateEpisodeFilePath")(
  function* (input: {
    animeRoot: string;
    filePath: string;
    fs: FileSystemShape;
    outOfRootMessage: string;
  }) {
    const resolvedPath = yield* input.fs.realPath(input.filePath).pipe(
      Effect.mapError(
        (cause) =>
          new MediaPathError({
            cause,
            message: "File path does not exist or is inaccessible",
          }),
      ),
    );

    if (!isWithinPathRoot(resolvedPath, input.animeRoot)) {
      return yield* new MediaPathError({
        message: input.outOfRootMessage,
      });
    }

    return resolvedPath;
  },
);
