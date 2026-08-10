import { Schema } from "effect";
import { ApiClientError, ApiDecodeError, ApiUnauthorizedError } from "~/api/effect/api-client";

export class ClipboardWriteError extends Schema.TaggedError<ClipboardWriteError>()(
  "ClipboardWriteError",
  {
    cause: Schema.optional(Schema.Defect),
    message: Schema.String,
  },
) {}

export class DownloadEventsExportError extends Schema.TaggedError<DownloadEventsExportError>()(
  "DownloadEventsExportError",
  {
    cause: Schema.optional(Schema.Defect),
    message: Schema.String,
  },
) {}

type MessageTaggedError =
  | ApiClientError
  | ApiDecodeError
  | ApiUnauthorizedError
  | ClipboardWriteError
  | DownloadEventsExportError;

function isMessageTaggedError(error: unknown): error is MessageTaggedError {
  return (
    error instanceof ApiClientError ||
    error instanceof ApiDecodeError ||
    error instanceof ApiUnauthorizedError ||
    error instanceof ClipboardWriteError ||
    error instanceof DownloadEventsExportError
  );
}

export function errorMessage(error: unknown, fallback: string): string {
  return isMessageTaggedError(error) ? error.message : fallback;
}

/**
 * TanStack Form field errors are `string | { message: string } | number | boolean`.
 * Extract a displayable message, defaulting for anything unexpected.
 */
export function fieldErrorMessage(error: unknown): string {
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "message" in error) {
    const message = error.message;
    return typeof message === "string" ? message : "Invalid field value";
  }
  if (typeof error === "number" || typeof error === "boolean") return String(error);
  return "Invalid field value";
}

export function formatFieldErrors(errors: readonly unknown[]): string {
  return errors.map(fieldErrorMessage).join(", ");
}

export function firstFieldErrorMessage(errors: readonly unknown[]): string | undefined {
  const first = errors[0];
  return first === undefined ? undefined : fieldErrorMessage(first);
}
