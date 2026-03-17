import { Effect } from "effect";

import { DatabaseError } from "../db/database.ts";

const DATABASE_BUSY_RETRY_COUNT = 8;
const DATABASE_BUSY_RETRY_DELAY = "25 millis";

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
  const attempt = (remainingRetries: number): Effect.Effect<A, DatabaseError> =>
    Effect.tryPromise({
      try: try_,
      catch: toDatabaseError(message),
    }).pipe(
      Effect.catchTag(
        "DatabaseError",
        (error) =>
          error.isBusyLock() && remainingRetries > 0
            ? Effect.sleep(DATABASE_BUSY_RETRY_DELAY).pipe(
              Effect.zipRight(attempt(remainingRetries - 1)),
            )
            : Effect.fail(error),
      ),
    );

  return attempt(DATABASE_BUSY_RETRY_COUNT);
}
