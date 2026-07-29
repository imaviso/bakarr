import { Schema, SchemaIssue } from "effect";

export class RequestValidationError extends Schema.TaggedErrorClass<RequestValidationError>()(
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
          const path =
            issue.path && issue.path.length > 0
              ? issue.path
                  .map((p) => (typeof p === "object" && p !== null ? String(p.key) : String(p)))
                  .join(".")
              : "input";
          return `${path}: ${issue.message}`;
        })
        .join("; ");

      return `${message}: ${details}`;
    }
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return `${message}: ${error.message}`;
  }

  return message;
}
