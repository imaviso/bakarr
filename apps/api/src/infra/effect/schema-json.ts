import { Effect, Schema } from "effect";

export function encodeJson<A, I, R, E>(
  schema: Schema.Schema<A, I, R>,
  value: A,
  mapError: (cause: unknown) => E,
): Effect.Effect<string, E, R> {
  return Schema.encode(Schema.parseJson(schema))(value).pipe(Effect.mapError(mapError));
}

export function decodeJson<A, I, R, E>(
  schema: Schema.Schema<A, I, R>,
  value: string,
  mapError: (cause: unknown) => E,
): Effect.Effect<A, E, R> {
  return Schema.decodeUnknown(Schema.parseJson(schema))(value).pipe(Effect.mapError(mapError));
}
