import { Schema } from "effect";

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

export type OperationsError =
  | DownloadNotFoundError
  | DownloadConflictError
  | OperationsAnimeNotFoundError
  | OperationsInputError;
