import type { FileSystemShape } from "@/infra/filesystem/filesystem.ts";
import { isWithinPathRoot } from "@/infra/filesystem/filesystem.ts";
import { DomainPathError } from "@/features/errors.ts";
import { Effect } from "effect";

export const VIDEO_UNIT_FILE_EXTENSIONS: readonly string[] = [
  ".mkv",
  ".mp4",
  ".avi",
  ".mov",
  ".webm",
];
export const VOLUME_UNIT_FILE_EXTENSIONS: readonly string[] = [".cbz", ".cbr", ".pdf", ".epub"];

/**
 * Canonical media file extensions — the same set the rescan collectors
 * (`collectVideoFiles` / `collectVolumeFiles`) discover. Unit file mapping
 * must reject anything else, otherwise the next rescan silently un-maps it.
 */
export const UNIT_FILE_EXTENSIONS: ReadonlySet<string> = new Set([
  ...VIDEO_UNIT_FILE_EXTENSIONS,
  ...VOLUME_UNIT_FILE_EXTENSIONS,
]);

export const loadMediaRoot = Effect.fn("MediaFilePathPolicy.loadMediaRoot")(function* (
  fs: FileSystemShape,
  rootFolder: string,
) {
  return yield* fs.realPath(rootFolder).pipe(
    Effect.mapError(
      (cause) =>
        new DomainPathError({
          cause,
          message: "Media root folder does not exist",
        }),
    ),
  );
});

export const validateUnitFilePath = Effect.fn("MediaFilePathPolicy.validateUnitFilePath")(
  function* (input: {
    filePath: string;
    fs: FileSystemShape;
    mediaRoot: string;
    outOfRootMessage: string;
  }) {
    const resolvedPath = yield* input.fs.realPath(input.filePath).pipe(
      Effect.mapError(
        (cause) =>
          new DomainPathError({
            cause,
            message: "File path does not exist or is inaccessible",
          }),
      ),
    );

    if (!isWithinPathRoot(resolvedPath, input.mediaRoot)) {
      return yield* new DomainPathError({
        message: input.outOfRootMessage,
      });
    }

    if (!hasUnitFileExtension(resolvedPath)) {
      return yield* new DomainPathError({
        message: "File type is not a supported media file",
      });
    }

    return resolvedPath;
  },
);

function hasUnitFileExtension(filePath: string) {
  const lowerFilePath = filePath.toLowerCase();
  for (const extension of UNIT_FILE_EXTENSIONS) {
    if (lowerFilePath.endsWith(extension)) {
      return true;
    }
  }

  return false;
}
