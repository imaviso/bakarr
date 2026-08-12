// oxlint-disable typescript/no-restricted-types -- `unknown` is the honest type at error/cause boundaries (Effect error channels, try/catch causes, Logger messages)
/**
 * Centralized filesystem error classification.
 * Feature modules should import from here instead of inspecting
 * platform error codes directly.
 */
import { Predicate } from "effect";

/** Check if an error wraps a "not found" platform error (ENOENT / Deno NotFound). */
export function isNotFoundError(error: { cause?: unknown }): boolean {
  const { cause } = error;

  if (isSystemNotFoundError(cause)) {
    return true;
  }

  if (cause instanceof Error) {
    const code = getErrorCode(cause);
    return code === "ENOENT" || code === "NotFound";
  }

  if (Predicate.hasProperty(cause, "cause")) {
    return isNotFoundError({ cause: cause.cause });
  }

  return false;
}

/** Check if an error wraps a cross-device rename error (EXDEV). */
export function isCrossFilesystemError(error: { cause?: unknown }): boolean {
  const { cause } = error;
  if (cause instanceof Error) {
    return getErrorCode(cause) === "EXDEV";
  }
  return false;
}

/** Check if a platform SystemError itself is a NotFound branch. */
export function isSystemNotFoundError(error: unknown): boolean {
  return Predicate.hasProperty(error, "reason") && error.reason === "NotFound";
}

function getErrorCode(error: Error): string | undefined {
  if (!("code" in error)) {
    return undefined;
  }

  const code = error.code;
  return typeof code === "string" ? code : undefined;
}
