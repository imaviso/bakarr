import { eq } from "drizzle-orm";
import { Effect, Option } from "effect";

import { ProfileNotFoundError } from "@/features/system/errors.ts";
import type { AppDatabase } from "@/db/database.ts";
import { media, mediaUnits } from "@/db/schema.ts";
import { MediaConflictError, MediaNotFoundError } from "@/features/media/errors.ts";
import { findAnimeRootFolderOwnerEffect } from "@/features/media/shared/media-read-repository.ts";
import { qualityProfileExistsEffect } from "@/features/media/shared/profile-support.ts";
import { tryDatabasePromise } from "@/infra/effect/db.ts";

export const checkAnimeExistsEffect = Effect.fn("AnimeAddValidation.checkAnimeExists")(function* (
  db: AppDatabase,
  mediaId: number,
) {
  const existing = yield* tryDatabasePromise("Failed to check media existence", () =>
    db.select({ id: media.id }).from(media).where(eq(media.id, mediaId)).limit(1),
  );

  if (existing[0]) {
    return yield* new MediaConflictError({
      message: "Media already exists",
    });
  }

  return undefined;
});

export const requireAnimeMetadataEffect = <T>(
  metadata: Option.Option<T>,
): Effect.Effect<T, MediaNotFoundError> => {
  if (Option.isNone(metadata)) {
    return Effect.fail(new MediaNotFoundError({ message: "Media not found" }));
  }
  return Effect.succeed(metadata.value);
};

export const checkProfileExistsEffect = Effect.fn("AnimeAddValidation.checkProfileExists")(
  function* (db: AppDatabase, profileName: string) {
    const profileExists = yield* qualityProfileExistsEffect(db, profileName);

    if (!profileExists) {
      return yield* new ProfileNotFoundError({
        message: `Quality profile '${profileName}' not found`,
      });
    }

    return undefined;
  },
);

export const checkRootFolderNotOwnedEffect = Effect.fn(
  "AnimeAddValidation.checkRootFolderNotOwned",
)(function* (db: AppDatabase, rootFolder: string) {
  const existingRootOwner = yield* findAnimeRootFolderOwnerEffect(db, rootFolder);

  if (existingRootOwner) {
    return yield* new MediaConflictError({
      message: `Folder is already mapped to ${existingRootOwner.titleRomaji}`,
    });
  }

  return undefined;
});

export const fetchPersistedEpisodeRowsEffect = Effect.fn(
  "AnimeAddValidation.fetchPersistedEpisodeRows",
)(function* (db: AppDatabase, mediaId: number) {
  return yield* tryDatabasePromise("Failed to fetch persisted mediaUnits", () =>
    db.select().from(mediaUnits).where(eq(mediaUnits.mediaId, mediaId)),
  );
});
