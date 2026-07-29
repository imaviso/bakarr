import { win32 as Win32Path } from "node:path";
import { Effect, Result, Schema } from "effect";

export class PathSegmentError extends Schema.TaggedErrorClass<PathSegmentError>()(
  "PathSegmentError",
  {
    message: Schema.String,
    segment: Schema.String,
  },
) {}

export function isWithinPathRoot(path: string, root: string) {
  const resolvedPath = Win32Path.resolve(path.replace(/[\\/]+/g, "/"));
  const resolvedRoot = Win32Path.resolve(root.replace(/[\\/]+/g, "/"));

  if (resolvedPath === resolvedRoot) {
    return true;
  }

  const relativePath = Win32Path.relative(resolvedRoot, resolvedPath);

  if (relativePath === "") {
    return true;
  }

  if (
    relativePath.startsWith("..") ||
    relativePath.startsWith("/") ||
    relativePath.startsWith("\\")
  ) {
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
