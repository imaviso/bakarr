import { eq } from "drizzle-orm";
import { Effect } from "effect";

import type { AppDatabase } from "../../db/database.ts";
import { DatabaseError } from "../../db/database.ts";
import { makeSingleFlightEffectRunner } from "../../lib/effect-coalescing.ts";
import { anime } from "../../db/schema.ts";
import { toDatabaseError, tryDatabasePromise } from "../../lib/effect-db.ts";
export { tryDatabasePromise } from "../../lib/effect-db.ts";
import type { EventPublisherShape } from "../events/publisher.ts";
import {
  AnimeConflictError,
  AnimeNotFoundError,
  AnimePathError,
  type AnimeServiceError,
} from "./errors.ts";
import { appendAnimeLogEffect, requireAnimeExistsEffect } from "./repository.ts";
import { AniListClient } from "./anilist.ts";
import { refreshMetadataForMonitoredAnimeEffect } from "./orchestration-support.ts";

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

export const updateAnimeRow = Effect.fn("AnimeService.updateAnimeRow")(function* (
  db: AppDatabase,
  animeId: number,
  patch: Partial<typeof anime.$inferInsert>,
  message: string,
  eventPublisher: Pick<EventPublisherShape, "publishInfo">,
  nowIso: () => Effect.Effect<string>,
) {
  yield* requireAnimeExistsEffect(db, animeId).pipe(
    Effect.mapError(wrapAnimeError("Failed to update anime")),
  );
  yield* tryDatabasePromise("Failed to update anime", () =>
    db.update(anime).set(patch).where(eq(anime.id, animeId)),
  );
  yield* appendAnimeLogEffect(db, "anime.updated", "success", message, nowIso);
  yield* eventPublisher.publishInfo(message);
});

export const makeMetadataRefreshRunner = Effect.fn("AnimeService.makeMetadataRefreshRunner")(
  function* (input: {
    aniList: typeof AniListClient.Service;
    db: AppDatabase;
    nowIso: () => Effect.Effect<string>;
  }) {
    return yield* makeSingleFlightEffectRunner(refreshMetadataForMonitoredAnimeEffect(input));
  },
);
