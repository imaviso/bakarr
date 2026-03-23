import { Effect, ParseResult, Schema } from "effect";

const UnknownJsonSchema = Schema.parseJson(Schema.Unknown);

export class RequestValidationError
  extends Schema.TaggedError<RequestValidationError>()(
    "RequestValidationError",
    {
      message: Schema.String,
      status: Schema.Literal(400),
    },
  ) {}

export function formatValidationErrorMessage(message: string, error: unknown) {
  if (ParseResult.isParseError(error)) {
    const issues = ParseResult.ArrayFormatter.formatErrorSync(error);

    if (issues.length > 0) {
      const details = issues.slice(0, 3).map((issue) => {
        const path = issue.path.length > 0 ? issue.path.join(".") : "input";
        return `${path}: ${issue.message}`;
      }).join("; ");

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

export function decodeUnknownInput<A, I>(
  input: unknown,
  schema: Schema.Schema<A, I>,
  message: string,
): Effect.Effect<A, RequestValidationError> {
  return Schema.decodeUnknown(schema)(input).pipe(
    Effect.mapError((error) =>
      RequestValidationError.make({
        message: formatValidationErrorMessage(message, error),
        status: 400,
      })
    ),
  );
}

export function parseJsonBody<A, I>(
  c: { req: { json: () => Promise<unknown> } },
  schema: Schema.Schema<A, I>,
  label: string,
): Effect.Effect<A, RequestValidationError> {
  return Effect.tryPromise({
    try: () => c.req.json(),
    catch: () =>
      RequestValidationError.make({
        message: `Invalid JSON for ${label}`,
        status: 400,
      }),
  }).pipe(
    Effect.flatMap((json) =>
      Schema.decodeUnknown(schema)(json).pipe(
        Effect.mapError((error) =>
          RequestValidationError.make({
            message: formatValidationErrorMessage(
              `Invalid request body for ${label}`,
              error,
            ),
            status: 400,
          })
        ),
      )
    ),
  );
}

export function parseOptionalJsonBody<A, I>(
  c: { req: { text: () => Promise<string> } },
  schema: Schema.Schema<A, I>,
  label: string,
): Effect.Effect<A, RequestValidationError> {
  return Effect.tryPromise({
    try: () => c.req.text(),
    catch: () =>
      RequestValidationError.make({
        message: `Malformed JSON for ${label}`,
        status: 400,
      }),
  }).pipe(
    Effect.flatMap((text) => {
      if (!text || text.trim() === "") {
        return Effect.succeed({});
      }

      return Schema.decodeUnknown(UnknownJsonSchema)(text).pipe(
        Effect.mapError(() =>
          RequestValidationError.make({
            message: `Malformed JSON for ${label}`,
            status: 400,
          })
        ),
      );
    }),
    Effect.flatMap((json) =>
      Schema.decodeUnknown(schema)(json).pipe(
        Effect.mapError((error) =>
          RequestValidationError.make({
            message: formatValidationErrorMessage(
              `Invalid request body for ${label}`,
              error,
            ),
            status: 400,
          })
        ),
      )
    ),
  );
}

export function parseParams<A, I>(
  c: { req: { param: () => Record<string, string> } },
  schema: Schema.Schema<A, I>,
  label: string,
): Effect.Effect<A, RequestValidationError> {
  return decodeUnknownInput(
    c.req.param(),
    schema,
    `Invalid route params for ${label}`,
  );
}

export function parseQuery<A, I>(
  c: { req: { url: string } },
  schema: Schema.Schema<A, I>,
  label: string,
): Effect.Effect<A, RequestValidationError> {
  const searchParams = new URL(c.req.url).searchParams;
  return decodeUnknownInput(
    Object.fromEntries(searchParams.entries()),
    schema,
    `Invalid query parameters for ${label}`,
  );
}
