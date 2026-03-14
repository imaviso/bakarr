import { Effect, ParseResult, Schema } from "effect";

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
    try: async () => {
      const text = await c.req.text();
      if (!text || text.trim() === "") {
        return {};
      }
      return JSON.parse(text);
    },
    catch: () =>
      RequestValidationError.make({
        message: `Malformed JSON for ${label}`,
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

export function withJsonBody<A, I, B, E, R>(
  c: { req: { json: () => Promise<unknown> } },
  schema: Schema.Schema<A, I>,
  label: string,
  effect: (body: A) => Effect.Effect<B, E, R>,
): Effect.Effect<B, E | RequestValidationError, R> {
  return parseJsonBody(c, schema, label).pipe(Effect.flatMap(effect));
}

export function withOptionalJsonBody<A, I, B, E, R>(
  c: { req: { text: () => Promise<string> } },
  schema: Schema.Schema<A, I>,
  label: string,
  effect: (body: A) => Effect.Effect<B, E, R>,
): Effect.Effect<B, E | RequestValidationError, R> {
  return parseOptionalJsonBody(c, schema, label).pipe(Effect.flatMap(effect));
}

export function withParams<A, I, B, E, R>(
  c: { req: { param: () => Record<string, string> } },
  schema: Schema.Schema<A, I>,
  label: string,
  effect: (params: A) => Effect.Effect<B, E, R>,
): Effect.Effect<B, E | RequestValidationError, R> {
  return parseParams(c, schema, label).pipe(Effect.flatMap(effect));
}

export function withQuery<A, I, B, E, R>(
  c: { req: { url: string } },
  schema: Schema.Schema<A, I>,
  label: string,
  effect: (query: A) => Effect.Effect<B, E, R>,
): Effect.Effect<B, E | RequestValidationError, R> {
  return parseQuery(c, schema, label).pipe(Effect.flatMap(effect));
}

export function withParamsAndBody<PA, PI, BA, BI, B, E, R>(
  c: {
    req: { json: () => Promise<unknown>; param: () => Record<string, string> };
  },
  paramsSchema: Schema.Schema<PA, PI>,
  bodySchema: Schema.Schema<BA, BI>,
  label: string,
  effect: (params: PA, body: BA) => Effect.Effect<B, E, R>,
): Effect.Effect<B, E | RequestValidationError, R> {
  return Effect.all({
    body: parseJsonBody(c, bodySchema, label),
    params: parseParams(c, paramsSchema, label),
  }).pipe(Effect.flatMap(({ body, params }) => effect(params, body)));
}
