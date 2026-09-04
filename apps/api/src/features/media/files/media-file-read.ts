import type { FileSystemShape } from "@/infra/filesystem/filesystem.ts";
import { isWithinPathRoot } from "@/infra/filesystem/filesystem.ts";
import type { MediaRepositoryShape } from "@/features/media/shared/media-repository.ts";
import { Effect } from "effect";
import {
  UnitFileResolveError,
  UnitFileResolved,
} from "@/features/media/files/media-file-resolution.ts";

export const resolveUnitFileEffect = Effect.fn("MediaFileRead.resolveUnitFileEffect")(
  function* (input: {
    mediaId: number;
    mediaRepository: MediaRepositoryShape;
    unitNumber: number;
    fs: FileSystemShape;
  }) {
    const mediaRow = yield* input.mediaRepository.getMediaRow(input.mediaId);
    const unitRow = yield* input.mediaRepository.getUnitRow(input.mediaId, input.unitNumber);

    if (!unitRow.filePath) {
      return yield* new UnitFileResolveError({
        mediaId: input.mediaId,
        message: "MediaUnit file not found",
        reason: "unmapped",
        unitNumber: input.unitNumber,
      });
    }

    const mediaRootResult = yield* Effect.result(input.fs.realPath(mediaRow.rootFolder));

    if (mediaRootResult._tag === "Failure") {
      yield* Effect.logDebug("Media root folder not accessible").pipe(
        Effect.annotateLogs({
          mediaId: input.mediaId,
          unitNumber: input.unitNumber,
          rootFolder: mediaRow.rootFolder,
        }),
      );
      return yield* new UnitFileResolveError({
        mediaId: input.mediaId,
        message: "Media root folder is inaccessible",
        reason: "root-inaccessible",
        rootFolder: mediaRow.rootFolder,
        unitNumber: input.unitNumber,
      });
    }

    const filePathResult = yield* Effect.result(input.fs.realPath(unitRow.filePath));

    if (filePathResult._tag === "Failure") {
      yield* Effect.logDebug("MediaUnit file path not accessible").pipe(
        Effect.annotateLogs({
          mediaId: input.mediaId,
          unitNumber: input.unitNumber,
          filePath: unitRow.filePath,
        }),
      );
      return yield* new UnitFileResolveError({
        filePath: unitRow.filePath,
        mediaId: input.mediaId,
        message: "MediaUnit file not found",
        reason: "missing",
        unitNumber: input.unitNumber,
      });
    }

    const filePath = filePathResult.success;

    if (!isWithinPathRoot(filePath, mediaRootResult.success)) {
      yield* Effect.logDebug("MediaUnit file outside media root").pipe(
        Effect.annotateLogs({
          mediaId: input.mediaId,
          unitNumber: input.unitNumber,
          filePath,
          mediaRoot: mediaRootResult.success,
        }),
      );
      return yield* new UnitFileResolveError({
        filePath,
        mediaId: input.mediaId,
        message: "MediaUnit file mapping is invalid",
        reason: "outside-root",
        rootFolder: mediaRootResult.success,
        unitNumber: input.unitNumber,
      });
    }

    return new UnitFileResolved({
      fileName: filePath.split("/").pop() ?? `episode-${input.unitNumber}`,
      filePath,
    });
  },
);
