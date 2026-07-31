import * as NodePath from "node:path";
import { Effect, Either, Schema } from "effect";

export class PathSegmentError extends Schema.TaggedError<PathSegmentError>()("PathSegmentError", {
  message: Schema.String,
  segment: Schema.String,
}) {}

export function isWithinPathRoot(path: string, root: string) {
  // Platform path semantics match platform filesystem case behavior:
  // win32 compares case-insensitively, posix case-sensitively.
  const resolvedPath = NodePath.resolve(path.replace(/[\\/]+/g, "/"));
  const resolvedRoot = NodePath.resolve(root.replace(/[\\/]+/g, "/"));

  if (resolvedPath === resolvedRoot) {
    return true;
  }

  const relativePath = NodePath.relative(resolvedRoot, resolvedPath);

  if (relativePath === "") {
    return true;
  }

  if (relativePath.startsWith("..") || NodePath.isAbsolute(relativePath)) {
    return false;
  }

  return true;
}

const sanitizePathSegmentEither = (value: string) => {
  const trimmed = value.trim();

  if (
    trimmed.length === 0 ||
    trimmed === "." ||
    trimmed === ".." ||
    trimmed.includes("/") ||
    trimmed.includes("\\")
  ) {
    return Either.left(
      new PathSegmentError({
        message: "Invalid path segment",
        segment: value,
      }),
    );
  }

  return Either.right(trimmed);
};

export const sanitizePathSegmentEffect = Effect.fn("FileSystem.sanitizePathSegmentEffect")(
  function* (value: string) {
    const result = sanitizePathSegmentEither(value);

    if (Either.isLeft(result)) {
      return yield* result.left;
    }

    return result.right;
  },
);

export function sanitizeFilename(name: string) {
  return name
    .replace(/[\\/:]/g, " ")
    .replace(/[*?"<>|]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
