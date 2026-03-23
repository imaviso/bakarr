/**
 * Centralized filesystem error classification.
 * Feature modules should import from here instead of inspecting
 * platform error codes directly.
 */

/** Check if an error wraps a "not found" platform error (ENOENT / Deno NotFound). */
export function isNotFoundError(error: { cause?: unknown }): boolean {
  const cause = error.cause;
  if (cause instanceof Error && "code" in cause) {
    const code = (cause as { code?: string }).code;
    return code === "ENOENT" || code === "NotFound";
  }
  return false;
}

/** Check if an error wraps a cross-device rename error (EXDEV). */
export function isCrossFilesystemError(error: { cause?: unknown }): boolean {
  const cause = error.cause;
  if (cause instanceof Error && "code" in cause) {
    return (cause as { code?: string }).code === "EXDEV";
  }
  return false;
}

/** Check if a platform SystemError itself is a NotFound branch. */
export function isSystemNotFoundError(error: { reason?: unknown }): boolean {
  return error.reason === "NotFound";
}
