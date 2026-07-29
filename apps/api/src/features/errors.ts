import { Schema } from "effect";

export class DomainNotFoundError extends Schema.TaggedErrorClass<DomainNotFoundError>()(
  "DomainNotFoundError",
  { cause: Schema.optional(Schema.Defect()), message: Schema.String },
) {}

export class DomainConflictError extends Schema.TaggedErrorClass<DomainConflictError>()(
  "DomainConflictError",
  { cause: Schema.optional(Schema.Defect()), message: Schema.String },
) {}

export class DomainInputError extends Schema.TaggedErrorClass<DomainInputError>()(
  "DomainInputError",
  {
    cause: Schema.optional(Schema.Defect()),
    message: Schema.String,
  },
) {}

export class DomainPathError extends Schema.TaggedErrorClass<DomainPathError>()("DomainPathError", {
  cause: Schema.optional(Schema.Defect()),
  message: Schema.String,
}) {}

export class StoredDataError extends Schema.TaggedErrorClass<StoredDataError>()("StoredDataError", {
  cause: Schema.optional(Schema.Defect()),
  message: Schema.String,
}) {}

export class InfrastructureError extends Schema.TaggedErrorClass<InfrastructureError>()(
  "InfrastructureError",
  { cause: Schema.Defect(), message: Schema.String },
) {}
