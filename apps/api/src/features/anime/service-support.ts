import { eq } from "drizzle-orm";
import { Effect } from "effect";

import type { AppDatabase } from "../../db/database.ts";
import { DatabaseError } from "../../db/database.ts";
import { anime } from "../../db/schema.ts";
import { toDatabaseError } from "../../lib/effect-db.ts";
export { tryDatabasePromise } from "../../lib/effect-db.ts";
import type { EventPublisherShape } from "../events/publisher.ts";
import {
  AnimeConflictError,
  AnimeNotFoundError,
  AnimePathError,
  type AnimeServiceError,
} from "./errors.ts";
import {
  appendAnimeLogEffect,
  requireAnimeExistsEffect,
} from "./repository.ts";

export function wrapAnimeError(message: string) {
  return (cause: unknown) => {
    if (
      cause instanceof AnimeNotFoundError ||
      cause instanceof AnimeConflictError ||
      cause instanceof AnimePathError ||
      cause instanceof DatabaseError
    ) {
      return cause;
    }

    return toDatabaseError(message)(cause);
  };
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
    eventPublisher: Pick<EventPublisherShape, "publishInfo">,
  ) {
    yield* requireAnimeExistsEffect(db, animeId).pipe(
      Effect.mapError(wrapAnimeError("Failed to update anime")),
    );
    yield* tryAnimePromise(
      "Failed to update anime",
      () => db.update(anime).set(patch).where(eq(anime.id, animeId)),
    );
    yield* appendAnimeLogEffect(db, "anime.updated", "success", message);
    yield* eventPublisher.publishInfo(message);
  },
);
