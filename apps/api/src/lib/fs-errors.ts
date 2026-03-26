/**
 * Centralized filesystem error classification.
 * Feature modules should import from here instead of inspecting
 * platform error codes directly.
 */

/** Check if an error wraps a "not found" platform error (ENOENT / Deno NotFound). */
export function isNotFoundError(error: { cause?: unknown }): boolean {
  const { cause } = error;

  if (isSystemNotFoundError(cause)) {
    return true;
  }

  if (cause instanceof Error && "code" in cause) {
    const { code } = cause as { code?: string };
    return code === "ENOENT" || code === "NotFound";
  }

  if (typeof cause === "object" && cause !== null && "cause" in cause) {
    return isNotFoundError({ cause: cause.cause });
  }

  return false;
}

/** Check if an error wraps a cross-device rename error (EXDEV). */
export function isCrossFilesystemError(error: { cause?: unknown }): boolean {
  const { cause } = error;
  if (cause instanceof Error && "code" in cause) {
    return (cause as { code?: string }).code === "EXDEV";
  }
  return false;
}

/** Check if a platform SystemError itself is a NotFound branch. */
export function isSystemNotFoundError(error: unknown): boolean {
  return (
    typeof error === "object" && error !== null && "reason" in error && error.reason === "NotFound"
  );
}
