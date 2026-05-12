import { Schema } from "effect";

export class DomainNotFoundError extends Schema.TaggedError<DomainNotFoundError>()(
  "DomainNotFoundError",
  { message: Schema.String },
) {}

export class DomainConflictError extends Schema.TaggedError<DomainConflictError>()(
  "DomainConflictError",
  { message: Schema.String },
) {}

export class DomainInputError extends Schema.TaggedError<DomainInputError>()("DomainInputError", {
  cause: Schema.optional(Schema.Defect),
  message: Schema.String,
}) {}

export class DomainPathError extends Schema.TaggedError<DomainPathError>()("DomainPathError", {
  cause: Schema.optional(Schema.Defect),
  message: Schema.String,
}) {}

export class StoredDataError extends Schema.TaggedError<StoredDataError>()("StoredDataError", {
  cause: Schema.optional(Schema.Defect),
  message: Schema.String,
}) {}

export class InfrastructureError extends Schema.TaggedError<InfrastructureError>()(
  "InfrastructureError",
  { cause: Schema.Defect, message: Schema.String },
) {}
