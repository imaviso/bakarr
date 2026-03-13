import { eq } from "drizzle-orm";
import { Effect } from "effect";

import type { NotificationEvent } from "../../../../../packages/shared/src/index.ts";
import type { AppDatabase } from "../../db/database.ts";
import { DatabaseError } from "../../db/database.ts";
import { anime } from "../../db/schema.ts";
import {
  AnimeConflictError,
  AnimeNotFoundError,
  type AnimeServiceError,
} from "./errors.ts";
import { appendAnimeLog, requireAnimeExists } from "./repository.ts";

export function wrapAnimeError(message: string) {
  return (cause: unknown) => {
    if (
      cause instanceof AnimeNotFoundError ||
      cause instanceof AnimeConflictError ||
      cause instanceof DatabaseError
    ) {
      return cause;
    }

    return new DatabaseError({ cause, message });
  };
}

export function tryDatabasePromise<A>(
  message: string,
  try_: () => Promise<A>,
): Effect.Effect<A, DatabaseError> {
  return Effect.tryPromise({
    try: try_,
    catch: (cause) => new DatabaseError({ cause, message }),
  });
}

export function tryAnimePromise<A>(
  message: string,
  try_: () => Promise<A>,
): Effect.Effect<A, AnimeServiceError | DatabaseError> {
  return Effect.tryPromise({
    try: try_,
    catch: wrapAnimeError(message),
  });
}

export const updateAnimeRow = Effect.fn("AnimeService.updateAnimeRow")(
  function* (
    db: AppDatabase,
    animeId: number,
    patch: Partial<typeof anime.$inferInsert>,
    message: string,
    eventBus: { publish: (event: NotificationEvent) => Effect.Effect<void> },
  ) {
    yield* tryAnimePromise(
      "Failed to update anime",
      () => requireAnimeExists(db, animeId),
    );
    yield* tryAnimePromise(
      "Failed to update anime",
      () => db.update(anime).set(patch).where(eq(anime.id, animeId)),
    );
    yield* tryDatabasePromise(
      "Failed to update anime",
      () => appendAnimeLog(db, "anime.updated", "success", message),
    );
    yield* eventBus.publish({ type: "Info", payload: { message } });
  },
);
