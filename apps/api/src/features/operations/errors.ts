import { Schema } from "effect";

import { ExternalCallError } from "../../lib/effect-retry.ts";

export { ExternalCallError };

export class DownloadNotFoundError
  extends Schema.TaggedError<DownloadNotFoundError>()(
    "DownloadNotFoundError",
    { message: Schema.String },
  ) {}

export class OperationsAnimeNotFoundError
  extends Schema.TaggedError<OperationsAnimeNotFoundError>()(
    "OperationsAnimeNotFoundError",
    { message: Schema.String },
  ) {}

export class DownloadConflictError
  extends Schema.TaggedError<DownloadConflictError>()(
    "DownloadConflictError",
    { message: Schema.String },
  ) {}

export class OperationsInputError
  extends Schema.TaggedError<OperationsInputError>()(
    "OperationsInputError",
    { message: Schema.String },
  ) {}

export class OperationsConflictError
  extends Schema.TaggedError<OperationsConflictError>()(
    "OperationsConflictError",
    { message: Schema.String },
  ) {}

export type OperationsError =
  | DownloadNotFoundError
  | DownloadConflictError
  | OperationsConflictError
  | OperationsAnimeNotFoundError
  | OperationsInputError
  | ExternalCallError;
