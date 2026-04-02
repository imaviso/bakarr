import { Effect } from "effect";

import { DatabaseError } from "@/db/database.ts";

export type TryDatabasePromise = <A>(
  message: string,
  try_: () => Promise<A>,
) => Effect.Effect<A, DatabaseError>;

const DATABASE_BUSY_RETRY_DELAY = "25 millis";
const DATABASE_BUSY_RETRY_COUNT = 8;

export function toDatabaseError(message: string) {
  return (cause: unknown) =>
    cause instanceof DatabaseError ? cause : new DatabaseError({ cause, message });
}

export const tryDatabasePromise = Effect.fn("Database.tryDatabasePromise")(<A>(
  message: string,
  try_: () => Promise<A>,
): Effect.Effect<A, DatabaseError> => {
  const maxAttempts = DATABASE_BUSY_RETRY_COUNT + 1;

  const attempt = (remaining: number): Effect.Effect<A, DatabaseError> =>
    Effect.tryPromise({
      try: try_,
      catch: toDatabaseError(message),
    }).pipe(
      Effect.catchTag("DatabaseError", (error) =>
        error.isBusyLock() && remaining > 0
          ? Effect.logWarning("database busy; retrying operation").pipe(
              Effect.annotateLogs({
                attempt: maxAttempts - remaining,
                maxAttempts,
                retryDelay: DATABASE_BUSY_RETRY_DELAY,
              }),
              Effect.zipRight(Effect.sleep(DATABASE_BUSY_RETRY_DELAY)),
              Effect.zipRight(attempt(remaining - 1)),
            )
          : Effect.fail(error),
      ),
    );

  return attempt(DATABASE_BUSY_RETRY_COUNT);
});
