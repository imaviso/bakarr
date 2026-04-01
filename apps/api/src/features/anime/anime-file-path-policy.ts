import { Effect } from "effect";

import type { FileSystemShape } from "@/lib/filesystem.ts";
import { isWithinPathRoot } from "@/lib/filesystem.ts";
import { AnimePathError } from "@/features/anime/errors.ts";

export const loadAnimeRoot = Effect.fn("AnimeFilePathPolicy.loadAnimeRoot")(function* (
  fs: FileSystemShape,
  rootFolder: string,
) {
  return yield* fs.realPath(rootFolder).pipe(
    Effect.mapError(
      () =>
        new AnimePathError({
          message: "Anime root folder does not exist",
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
        () =>
          new AnimePathError({
            message: "File path does not exist or is inaccessible",
          }),
      ),
    );

    if (!isWithinPathRoot(resolvedPath, input.animeRoot)) {
      return yield* new AnimePathError({
        message: input.outOfRootMessage,
      });
    }

    return resolvedPath;
  },
);
