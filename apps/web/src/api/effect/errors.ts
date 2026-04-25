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
