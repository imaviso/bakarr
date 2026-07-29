import { Effect } from "effect";
import { win32 as PathForUtilities } from "node:path";

import { isWithinPathRoot, type FileSystemShape } from "@/infra/filesystem/filesystem.ts";
import { DomainPathError } from "@/features/errors.ts";

export const resolveConfiguredLibraryRoot = Effect.fn(
  "MediaPathPolicy.resolveConfiguredLibraryRoot",
)(function* (fs: FileSystemShape, configuredLibraryPath: string) {
  const resolved = yield* Effect.result(fs.realPath(configuredLibraryPath));

  if (resolved._tag === "Success") {
    return resolved.success;
  }

  return configuredLibraryPath;
});

export const findExistingAncestorPath = Effect.fn("MediaPathPolicy.findExistingAncestorPath")(
  function* (fs: FileSystemShape, path: string) {
    let current = path;

    while (true) {
      const resolved = yield* Effect.result(fs.realPath(current));

      if (resolved._tag === "Success") {
        return resolved.success;
      }

      const parent = PathForUtilities.dirname(current.replace(/[\\/]+/g, "/"));

      if (parent === current) {
        return yield* new DomainPathError({
          message: "Media path must be within the configured library root",
        });
      }

      current = parent;
    }
  },
);

export const assertPathWithinLibraryRoot = Effect.fn("MediaPathPolicy.assertPathWithinLibraryRoot")(
  function* (fs: FileSystemShape, path: string, libraryRoot: string) {
    const resolvedPath = yield* Effect.result(fs.realPath(path));

    if (resolvedPath._tag === "Success") {
      if (!isWithinPathRoot(resolvedPath.success, libraryRoot)) {
        return yield* new DomainPathError({
          message: "Media path must be within the configured library root",
        });
      }

      return resolvedPath.success;
    }

    const canonicalParent = yield* findExistingAncestorPath(fs, path);

    if (!isWithinPathRoot(canonicalParent, libraryRoot)) {
      return yield* new DomainPathError({
        message: "Media path must be within the configured library root",
      });
    }

    return path;
  },
);
