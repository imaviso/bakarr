import { Effect, Schedule } from "effect";

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

export const tryDatabasePromise = Effect.fn("Database.tryDatabasePromise")(
  <A>(message: string, try_: () => Promise<A>): Effect.Effect<A, DatabaseError> =>
    Effect.tryPromise({ try: try_, catch: toDatabaseError(message) }).pipe(
      Effect.retry(
        Schedule.spaced(DATABASE_BUSY_RETRY_DELAY).pipe(
          Schedule.whileInput((error: DatabaseError) => error.isBusyLock()),
          Schedule.compose(Schedule.recurs(DATABASE_BUSY_RETRY_COUNT)),
        ),
      ),
    ),
);
