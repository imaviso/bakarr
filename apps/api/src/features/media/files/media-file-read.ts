import { Effect } from "effect";

import type { AppDatabase } from "@/db/database.ts";
import type { FileSystemShape } from "@/infra/filesystem/filesystem.ts";
import { isWithinPathRoot } from "@/infra/filesystem/filesystem.ts";
import type { MediaReadRepositoryShape } from "@/features/media/shared/media-read-repository.ts";
import {
  EpisodeFileResolved,
  EpisodeFileUnmapped,
  EpisodeFileRootInaccessible,
  EpisodeFileMissing,
  EpisodeFileOutsideRoot,
} from "@/features/media/files/media-file-resolution.ts";

export const resolveUnitFileEffect = Effect.fn("AnimeFileRead.resolveUnitFileEffect")(
  function* (input: {
    mediaId: number;
    db: AppDatabase;
    mediaReadRepository: MediaReadRepositoryShape;
    unitNumber: number;
    fs: FileSystemShape;
  }) {
    const animeRow = yield* input.mediaReadRepository.getAnimeRow(input.mediaId);
    const episodeRow = yield* input.mediaReadRepository.getEpisodeRow(
      input.mediaId,
      input.unitNumber,
    );

    if (!episodeRow.filePath) {
      return new EpisodeFileUnmapped();
    }

    const animeRootResult = yield* Effect.either(input.fs.realPath(animeRow.rootFolder));

    if (animeRootResult._tag === "Left") {
      yield* Effect.logDebug("Media root folder not accessible").pipe(
        Effect.annotateLogs({
          mediaId: input.mediaId,
          unitNumber: input.unitNumber,
          rootFolder: animeRow.rootFolder,
        }),
      );
      return new EpisodeFileRootInaccessible({
        rootFolder: animeRow.rootFolder,
      });
    }

    const filePathResult = yield* Effect.either(input.fs.realPath(episodeRow.filePath));

    if (filePathResult._tag === "Left") {
      yield* Effect.logDebug("MediaUnit file path not accessible").pipe(
        Effect.annotateLogs({
          mediaId: input.mediaId,
          unitNumber: input.unitNumber,
          filePath: episodeRow.filePath,
        }),
      );
      return new EpisodeFileMissing({
        filePath: episodeRow.filePath,
      });
    }

    const filePath = filePathResult.right;

    if (!isWithinPathRoot(filePath, animeRootResult.right)) {
      yield* Effect.logDebug("MediaUnit file outside media root").pipe(
        Effect.annotateLogs({
          mediaId: input.mediaId,
          unitNumber: input.unitNumber,
          filePath,
          animeRoot: animeRootResult.right,
        }),
      );
      return new EpisodeFileOutsideRoot({
        animeRoot: animeRootResult.right,
        filePath,
      });
    }

    return new EpisodeFileResolved({
      fileName: filePath.split("/").pop() ?? `episode-${input.unitNumber}`,
      filePath,
    });
  },
);
