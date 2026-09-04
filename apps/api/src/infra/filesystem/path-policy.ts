import * as NodePath from "node:path";
import { Effect, Result, Schema } from "effect";

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

  // Segment check, not a raw prefix check: `..foo` is a legal name while
  // a leading `..` segment escapes the root.
  const firstRelativeSegment = relativePath.split(/[\\/]/)[0];

  if (firstRelativeSegment === ".." || NodePath.isAbsolute(relativePath)) {
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
    return Result.fail(
      new PathSegmentError({
        message: "Invalid path segment",
        segment: value,
      }),
    );
  }

  return Result.succeed(trimmed);
};

export const sanitizePathSegmentEffect = Effect.fn("FileSystem.sanitizePathSegmentEffect")(
  function* (value: string) {
    const result = sanitizePathSegmentEither(value);

    if (Result.isFailure(result)) {
      return yield* result.failure;
    }

    return result.success;
  },
);

export function sanitizeFilename(name: string) {
  return name
    .replace(/[\\/:]/g, " ")
    .replace(/[*?"<>|]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
