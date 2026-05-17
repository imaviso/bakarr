import { eq } from "drizzle-orm";
import { Context, Effect, Layer } from "effect";

import { Database, type DatabaseError } from "@/db/database.ts";
import { media } from "@/db/schema.ts";
import { EventBus } from "@/features/events/event-bus.ts";
import { ClockService, nowIsoFromClock } from "@/infra/clock.ts";
import { FileSystem } from "@/infra/filesystem/filesystem.ts";
import { tryDatabasePromise } from "@/infra/effect/db.ts";
import { appendSystemLog } from "@/features/system/support.ts";
import { encodeNumberList } from "@/features/profiles/profile-codec.ts";
import { qualityProfileExistsEffect } from "@/features/media/shared/profile-support.ts";
import { getConfiguredLibraryPathEffect } from "@/features/media/shared/config-support.ts";
import {
  resolveConfiguredLibraryRoot,
  assertPathWithinLibraryRoot,
} from "@/features/media/shared/media-path-policy.ts";
import {
  requireAnimeExistsEffect,
  findAnimeRootFolderOwnerEffect,
} from "@/features/media/shared/media-read-repository.ts";
import {
  MediaPathError,
  MediaConflictError,
  type MediaServiceError,
} from "@/features/media/errors.ts";
import { ProfileNotFoundError } from "@/features/system/errors.ts";
import { MediaStoredDataError } from "@/features/media/errors.ts";

export interface AnimeSettingsServiceShape {
  readonly setMonitored: (
    id: number,
    monitored: boolean,
  ) => Effect.Effect<void, MediaServiceError | DatabaseError>;
  readonly updatePath: (
    id: number,
    path: string,
  ) => Effect.Effect<void, MediaServiceError | DatabaseError>;
  readonly updateProfile: (
    id: number,
    profileName: string,
  ) => Effect.Effect<void, MediaServiceError | DatabaseError | ProfileNotFoundError>;
  readonly updateReleaseProfiles: (
    id: number,
    releaseProfileIds: number[],
  ) => Effect.Effect<void, MediaServiceError | DatabaseError | MediaStoredDataError>;
}

export class AnimeSettingsService extends Context.Tag("@bakarr/api/AnimeSettingsService")<
  AnimeSettingsService,
  AnimeSettingsServiceShape
>() {}

const makeAnimeSettingsService = Effect.gen(function* () {
  const { db } = yield* Database;
  const eventBus = yield* EventBus;
  const fs = yield* FileSystem;
  const clock = yield* ClockService;
  const nowIso = () => nowIsoFromClock(clock);

  const setMonitored = Effect.fn("AnimeSettingsService.setMonitored")(function* (
    id: number,
    monitored: boolean,
  ) {
    yield* requireAnimeExistsEffect(db, id);
    yield* tryDatabasePromise("Failed to update media", () =>
      db.update(media).set({ monitored }).where(eq(media.id, id)),
    );
    const message = `Media ${id} monitoring updated`;
    yield* appendSystemLog(db, "media.updated", "success", message, nowIso);
    yield* eventBus.publishInfo(message);
  });

  const updatePath = Effect.fn("AnimeSettingsService.updatePath")(function* (
    id: number,
    path: string,
  ) {
    const trimmedPath = path.trim();

    const configuredLibraryPath = yield* getConfiguredLibraryPathEffect(db).pipe(
      Effect.mapError(
        (cause) =>
          new MediaPathError({
            cause,
            message: "Configured library root is inaccessible",
          }),
      ),
    );

    const canonicalLibraryRoot = yield* resolveConfiguredLibraryRoot(fs, configuredLibraryPath);

    yield* assertPathWithinLibraryRoot(fs, trimmedPath, canonicalLibraryRoot);
    yield* requireAnimeExistsEffect(db, id);

    yield* fs.mkdir(trimmedPath, { recursive: true }).pipe(
      Effect.mapError(
        (cause) =>
          new MediaPathError({
            cause,
            message: "Failed to create or access the requested media path",
          }),
      ),
    );

    const canonicalPath = yield* fs.realPath(trimmedPath).pipe(
      Effect.mapError(
        (cause) =>
          new MediaPathError({
            cause,
            message: "Path does not exist or is inaccessible",
          }),
      ),
    );

    const existingRootOwner = yield* findAnimeRootFolderOwnerEffect(db, canonicalPath);

    if (existingRootOwner && existingRootOwner.id !== id) {
      return yield* new MediaConflictError({
        message: `Folder is already mapped to ${existingRootOwner.titleRomaji}`,
      });
    }

    yield* tryDatabasePromise("Failed to update media path", () =>
      db.update(media).set({ rootFolder: canonicalPath }).where(eq(media.id, id)),
    );

    yield* appendSystemLog(
      db,
      "media.path.updated",
      "success",
      `Updated path for media ${id}`,
      nowIso,
    );

    yield* eventBus.publishInfo(`Updated path for media ${id}`);
    return undefined;
  });

  const updateProfile = Effect.fn("AnimeSettingsService.updateProfile")(function* (
    id: number,
    profileName: string,
  ) {
    const profileExists = yield* qualityProfileExistsEffect(db, profileName);

    if (!profileExists) {
      return yield* new ProfileNotFoundError({
        message: `Quality profile '${profileName}' not found`,
      });
    }

    yield* requireAnimeExistsEffect(db, id);
    yield* tryDatabasePromise("Failed to update media", () =>
      db.update(media).set({ profileName }).where(eq(media.id, id)),
    );
    const message = `Updated profile for media ${id}`;
    yield* appendSystemLog(db, "media.updated", "success", message, nowIso);
    yield* eventBus.publishInfo(message);
    return undefined;
  });

  const updateReleaseProfiles = Effect.fn("AnimeSettingsService.updateReleaseProfiles")(function* (
    id: number,
    releaseProfileIds: number[],
  ) {
    yield* requireAnimeExistsEffect(db, id);
    const encodedReleaseProfileIds = yield* encodeNumberList(releaseProfileIds).pipe(
      Effect.mapError(
        (cause) =>
          new MediaStoredDataError({
            cause,
            message: "Media release profile ids are invalid",
          }),
      ),
    );

    yield* tryDatabasePromise("Failed to update media", () =>
      db
        .update(media)
        .set({
          releaseProfileIds: encodedReleaseProfileIds,
        })
        .where(eq(media.id, id)),
    );
    const message = `Updated release profiles for media ${id}`;
    yield* appendSystemLog(db, "media.updated", "success", message, nowIso);
    yield* eventBus.publishInfo(message);
  });

  return {
    setMonitored,
    updatePath,
    updateProfile,
    updateReleaseProfiles,
  } satisfies AnimeSettingsServiceShape;
});

export const AnimeSettingsServiceLive = Layer.effect(
  AnimeSettingsService,
  makeAnimeSettingsService,
);
