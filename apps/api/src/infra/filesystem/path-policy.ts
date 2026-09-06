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

/**
 * Ext4/most Linux filesystems cap a single path component at 255 bytes. The
 * write pipeline appends staging suffixes (`.tmp.<uuid>`, `.bak.<uuid>` ≈ 41
 * bytes) to the destination name, so the rendered name must leave room for
 * them or every copy fails with ENAMETOOLONG.
 */
export const MAX_FILENAME_BYTES = 210;

/** Length of the longest staging suffix appended during atomic writes. */
export const STAGING_SUFFIX_RESERVE_BYTES = 45;

export function truncateFilenameToByteLimit(name: string, maxBytes: number) {
  const encoded = Buffer.from(name, "utf8");
  if (encoded.length <= maxBytes) {
    return name;
  }

  let truncated = encoded.toString("utf8", 0, maxBytes);
  // Dropping bytes can split a multi-byte sequence; toString already replaced
  // it with U+FFFD, so cut back to the last intact character boundary and
  // keep trimming whole code points until we fit.
  while (Buffer.from(truncated, "utf8").length > maxBytes) {
    truncated = Array.from(truncated).slice(0, -1).join("");
  }

  return truncated.replaceAll("\uFFFD", "").trimEnd();
}

export function sanitizeFilename(name: string) {
  const cleaned = name
    .replace(/[\\/:]/g, " ")
    .replace(/[*?"<>|]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  return truncateFilenameToByteLimit(cleaned, MAX_FILENAME_BYTES);
}
