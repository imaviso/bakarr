import { Effect } from "effect";
import { win32 as PathForUtilities } from "node:path";

import { isWithinPathRoot, type FileSystemShape } from "@/infra/filesystem/filesystem.ts";
import { AnimePathError } from "@/features/anime/errors.ts";

export const resolveConfiguredLibraryRoot = Effect.fn(
  "AnimePathPolicy.resolveConfiguredLibraryRoot",
)(function* (fs: FileSystemShape, configuredLibraryPath: string) {
  const resolved = yield* Effect.either(fs.realPath(configuredLibraryPath));

  if (resolved._tag === "Right") {
    return resolved.right;
  }

  return configuredLibraryPath;
});

export const findExistingAncestorPath = Effect.fn("AnimePathPolicy.findExistingAncestorPath")(
  function* (fs: FileSystemShape, path: string) {
    let current = path;

    while (true) {
      const resolved = yield* Effect.either(fs.realPath(current));

      if (resolved._tag === "Right") {
        return resolved.right;
      }

      const parent = PathForUtilities.dirname(current.replace(/[\\/]+/g, "/"));

      if (parent === current) {
        return yield* new AnimePathError({
          message: "Anime path must be within the configured library root",
        });
      }

      current = parent;
    }
  },
);

export const assertPathWithinLibraryRoot = Effect.fn("AnimePathPolicy.assertPathWithinLibraryRoot")(
  function* (fs: FileSystemShape, path: string, libraryRoot: string) {
    const resolvedPath = yield* Effect.either(fs.realPath(path));

    if (resolvedPath._tag === "Right") {
      if (!isWithinPathRoot(resolvedPath.right, libraryRoot)) {
        return yield* new AnimePathError({
          message: "Anime path must be within the configured library root",
        });
      }

      return resolvedPath.right;
    }

    const canonicalParent = yield* findExistingAncestorPath(fs, path);

    if (!isWithinPathRoot(canonicalParent, libraryRoot)) {
      return yield* new AnimePathError({
        message: "Anime path must be within the configured library root",
      });
    }

    return path;
  },
);
