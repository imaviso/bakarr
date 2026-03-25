import { Effect } from "effect";

import { DatabaseError } from "../db/database.ts";

const DATABASE_BUSY_RETRY_COUNT = 8;

export function toDatabaseError(message: string) {
  return (cause: unknown) =>
    cause instanceof DatabaseError ? cause : new DatabaseError({ cause, message });
}

export const tryDatabasePromise = Effect.fn("Database.tryDatabasePromise")(<A>(
  message: string,
  try_: () => Promise<A>,
): Effect.Effect<A, DatabaseError> => {
  const attempt = (remaining: number): Effect.Effect<A, DatabaseError> =>
    Effect.tryPromise({
      try: try_,
      catch: toDatabaseError(message),
    }).pipe(
      Effect.catchTag("DatabaseError", (error) =>
        error.isBusyLock() && remaining > 0
          ? Effect.sleep("25 millis").pipe(Effect.zipRight(attempt(remaining - 1)))
          : Effect.fail(error),
      ),
    );

  return attempt(DATABASE_BUSY_RETRY_COUNT);
});
