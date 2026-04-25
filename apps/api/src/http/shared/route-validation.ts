import { ParseResult, Schema } from "effect";

export class RequestValidationError extends Schema.TaggedError<RequestValidationError>()(
  "RequestValidationError",
  {
    cause: Schema.optional(Schema.Defect),
    message: Schema.String,
    status: Schema.Literal(400),
  },
) {}

export function formatValidationErrorMessage(message: string, error: unknown) {
  if (ParseResult.isParseError(error)) {
    const issues = ParseResult.ArrayFormatter.formatErrorSync(error);

    if (issues.length > 0) {
      const details = issues
        .slice(0, 3)
        .map((issue) => {
          const path = issue.path.length > 0 ? issue.path.join(".") : "input";
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
