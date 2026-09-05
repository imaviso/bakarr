// oxlint-disable typescript/no-restricted-types -- `unknown` is the honest type at error/cause boundaries (Effect error channels, try/catch causes, Logger messages)
import { Predicate, Schema, SchemaIssue } from "effect";

export class RequestValidationError extends Schema.TaggedError<RequestValidationError>()(
  "RequestValidationError",
  {
    cause: Schema.optional(Schema.Defect()),
    message: Schema.String,
    status: Schema.Literal(400),
  },
) {}

export function formatValidationErrorMessage(message: string, error: unknown) {
  if (Schema.isSchemaError(error)) {
    const issues = SchemaIssue.makeFormatterStandardSchemaV1()(error.issue).issues;

    if (issues.length > 0) {
      const details = issues
        .slice(0, 3)
        .map((issue) => {
          const path = (issue.path ?? []).map((segment) => globalThis.String(segment));
          return `${path.length > 0 ? path.join(".") : "input"}: ${issue.message}`;
        })
        .join("; ");

      return `${message}: ${details}`;
    }
  }

  if (Predicate.hasProperty(error, "message") && typeof error.message === "string") {
    return `${message}: ${error.message}`;
  }

  return message;
}
