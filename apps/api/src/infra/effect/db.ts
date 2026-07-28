import { Effect, Option, Schedule } from "effect";

import { DatabaseError } from "@/db/database.ts";

export type TryDatabase = <A, E>(
  message: string,
  query: () => Effect.Effect<A, E>,
) => Effect.Effect<A, DatabaseError>;

const DATABASE_BUSY_RETRY_DELAY = "25 millis";
const DATABASE_BUSY_RETRY_COUNT = 8;

export function toDatabaseError(message: string) {
  return (cause: unknown) =>
    cause instanceof DatabaseError ? cause : new DatabaseError({ cause, message });
}

export const tryDatabase = Effect.fn("Database.tryDatabase")(
  <A, E>(message: string, query: () => Effect.Effect<A, E>): Effect.Effect<A, DatabaseError> =>
    Effect.suspend(query).pipe(
      Effect.mapError(toDatabaseError(message)),
      Effect.retry({
        schedule: Schedule.spaced(DATABASE_BUSY_RETRY_DELAY),
        while: (error: DatabaseError) => error.isBusyLock(),
        times: DATABASE_BUSY_RETRY_COUNT,
      }),
    ),
);

export const queryFirst = Effect.fn("Database.queryFirst")(
  <A, E>(
    message: string,
    query: () => Effect.Effect<readonly A[], E>,
  ): Effect.Effect<Option.Option<A>, DatabaseError> =>
    tryDatabase(message, query).pipe(Effect.map((rows) => Option.fromNullishOr(rows[0]))),
);
