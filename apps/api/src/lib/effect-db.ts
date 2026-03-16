import { Effect } from "effect";

import { DatabaseError } from "../db/database.ts";

export function toDatabaseError(message: string) {
  return (cause: unknown) =>
    cause instanceof DatabaseError
      ? cause
      : new DatabaseError({ cause, message });
}

export function tryDatabasePromise<A>(
  message: string,
  try_: () => Promise<A>,
): Effect.Effect<A, DatabaseError> {
  return Effect.tryPromise({
    try: try_,
    catch: toDatabaseError(message),
  });
}
