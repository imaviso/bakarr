import { eq } from "drizzle-orm";
import { Effect } from "effect";

import { ProfileNotFoundError } from "@/features/system/errors.ts";
import type { AppDatabase } from "@/db/database.ts";
import { anime, episodes } from "@/db/schema.ts";
import { AnimeConflictError, AnimeNotFoundError } from "@/features/anime/errors.ts";
import { findAnimeRootFolderOwnerEffect } from "@/features/anime/anime-read-repository.ts";
import { qualityProfileExistsEffect } from "@/features/anime/profile-support.ts";
import { tryDatabasePromise } from "@/lib/effect-db.ts";

export const checkAnimeExistsEffect = Effect.fn("AnimeAddValidation.checkAnimeExists")(function* (
  db: AppDatabase,
  animeId: number,
) {
  const existing = yield* tryDatabasePromise("Failed to check anime existence", () =>
    db.select({ id: anime.id }).from(anime).where(eq(anime.id, animeId)).limit(1),
  );

  if (existing[0]) {
    return yield* new AnimeConflictError({
      message: "Anime already exists",
    });
  }
});

export const requireAnimeMetadataEffect = <T>(
  metadata: T | null | undefined,
): Effect.Effect<T, AnimeNotFoundError> => {
  if (!metadata) {
    return Effect.fail(new AnimeNotFoundError({ message: "Anime not found" }));
  }
  return Effect.succeed(metadata);
};

export const checkProfileExistsEffect = Effect.fn("AnimeAddValidation.checkProfileExists")(
  function* (db: AppDatabase, profileName: string) {
    const profileExists = yield* qualityProfileExistsEffect(db, profileName);

    if (!profileExists) {
      return yield* new ProfileNotFoundError({
        message: `Quality profile '${profileName}' not found`,
      });
    }
  },
);

export const checkRootFolderNotOwnedEffect = Effect.fn(
  "AnimeAddValidation.checkRootFolderNotOwned",
)(function* (db: AppDatabase, rootFolder: string) {
  const existingRootOwner = yield* findAnimeRootFolderOwnerEffect(db, rootFolder);

  if (existingRootOwner) {
    return yield* new AnimeConflictError({
      message: `Folder is already mapped to ${existingRootOwner.titleRomaji}`,
    });
  }
});

export const fetchPersistedEpisodeRowsEffect = Effect.fn(
  "AnimeAddValidation.fetchPersistedEpisodeRows",
)(function* (db: AppDatabase, animeId: number) {
  return yield* tryDatabasePromise("Failed to fetch persisted episodes", () =>
    db.select().from(episodes).where(eq(episodes.animeId, animeId)),
  );
});
