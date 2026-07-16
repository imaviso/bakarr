import { Effect } from "effect";

import type { FileSystemShape } from "@/infra/filesystem/filesystem.ts";
import { isWithinPathRoot } from "@/infra/filesystem/filesystem.ts";
import type { MediaRepositoryShape } from "@/features/media/shared/media-repository.ts";
import {
  UnitFileResolved,
  UnitFileUnmapped,
  UnitFileRootInaccessible,
  UnitFileMissing,
  UnitFileOutsideRoot,
} from "@/features/media/files/media-file-resolution.ts";

export const resolveUnitFileEffect = Effect.fn("MediaFileRead.resolveUnitFileEffect")(
  function* (input: {
    mediaId: number;
    mediaRepository: MediaRepositoryShape;
    unitNumber: number;
    fs: FileSystemShape;
  }) {
    const animeRow = yield* input.mediaRepository.getMediaRow(input.mediaId);
    const episodeRow = yield* input.mediaRepository.getUnitRow(input.mediaId, input.unitNumber);

    if (!episodeRow.filePath) {
      return new UnitFileUnmapped();
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
      return new UnitFileRootInaccessible({
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
      return new UnitFileMissing({
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
      return new UnitFileOutsideRoot({
        animeRoot: animeRootResult.right,
        filePath,
      });
    }

    return new UnitFileResolved({
      fileName: filePath.split("/").pop() ?? `episode-${input.unitNumber}`,
      filePath,
    });
  },
);
