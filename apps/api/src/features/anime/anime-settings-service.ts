import { eq } from "drizzle-orm";
import { Context, Effect, Layer } from "effect";

import { Database, type DatabaseError } from "@/db/database.ts";
import { anime } from "@/db/schema.ts";
import { EventPublisher } from "@/features/events/publisher.ts";
import { ClockService, nowIsoFromClock } from "@/lib/clock.ts";
import { FileSystem } from "@/lib/filesystem.ts";
import { tryDatabasePromise } from "@/lib/effect-db.ts";
import { appendSystemLog } from "@/features/system/support.ts";
import { encodeNumberList } from "@/features/system/config-codec.ts";
import { qualityProfileExistsEffect } from "@/features/anime/profile-support.ts";
import { getConfiguredLibraryPathEffect } from "@/features/anime/config-support.ts";
import {
  resolveConfiguredLibraryRoot,
  assertPathWithinLibraryRoot,
} from "@/features/anime/anime-path-policy.ts";
import {
  requireAnimeExistsEffect,
  findAnimeRootFolderOwnerEffect,
} from "@/features/anime/anime-read-repository.ts";
import {
  AnimePathError,
  AnimeConflictError,
  type AnimeServiceError,
} from "@/features/anime/errors.ts";
import { ProfileNotFoundError } from "@/features/system/errors.ts";
import { AnimeStoredDataError } from "@/features/anime/errors.ts";

export interface AnimeSettingsServiceShape {
  readonly setMonitored: (
    id: number,
    monitored: boolean,
  ) => Effect.Effect<void, AnimeServiceError | DatabaseError>;
  readonly updatePath: (
    id: number,
    path: string,
  ) => Effect.Effect<void, AnimeServiceError | DatabaseError>;
  readonly updateProfile: (
    id: number,
    profileName: string,
  ) => Effect.Effect<void, AnimeServiceError | DatabaseError | ProfileNotFoundError>;
  readonly updateReleaseProfiles: (
    id: number,
    releaseProfileIds: number[],
  ) => Effect.Effect<void, AnimeServiceError | DatabaseError | AnimeStoredDataError>;
}

export class AnimeSettingsService extends Context.Tag("@bakarr/api/AnimeSettingsService")<
  AnimeSettingsService,
  AnimeSettingsServiceShape
>() {}

const makeAnimeSettingsService = Effect.gen(function* () {
  const { db } = yield* Database;
  const eventPublisher = yield* EventPublisher;
  const fs = yield* FileSystem;
  const clock = yield* ClockService;
  const nowIso = () => nowIsoFromClock(clock);

  const setMonitored = Effect.fn("AnimeSettingsService.setMonitored")(function* (
    id: number,
    monitored: boolean,
  ) {
    yield* requireAnimeExistsEffect(db, id);
    yield* tryDatabasePromise("Failed to update anime", () =>
      db.update(anime).set({ monitored }).where(eq(anime.id, id)),
    );
    const message = `Anime ${id} monitoring updated`;
    yield* appendSystemLog(db, "anime.updated", "success", message, nowIso);
    yield* eventPublisher.publishInfo(message);
  });

  const updatePath = Effect.fn("AnimeSettingsService.updatePath")(function* (
    id: number,
    path: string,
  ) {
    const trimmedPath = path.trim();

    const configuredLibraryPath = yield* getConfiguredLibraryPathEffect(db).pipe(
      Effect.mapError(
        () => new AnimePathError({ message: "Configured library root is inaccessible" }),
      ),
    );

    const canonicalLibraryRoot = yield* resolveConfiguredLibraryRoot(fs, configuredLibraryPath);

    yield* assertPathWithinLibraryRoot(fs, trimmedPath, canonicalLibraryRoot);
    yield* requireAnimeExistsEffect(db, id);

    yield* fs
      .mkdir(trimmedPath, { recursive: true })
      .pipe(
        Effect.mapError(
          () =>
            new AnimePathError({ message: "Failed to create or access the requested anime path" }),
        ),
      );

    const canonicalPath = yield* fs
      .realPath(trimmedPath)
      .pipe(
        Effect.mapError(
          () => new AnimePathError({ message: "Path does not exist or is inaccessible" }),
        ),
      );

    const existingRootOwner = yield* findAnimeRootFolderOwnerEffect(db, canonicalPath);

    if (existingRootOwner && existingRootOwner.id !== id) {
      return yield* new AnimeConflictError({
        message: `Folder is already mapped to ${existingRootOwner.titleRomaji}`,
      });
    }

    yield* tryDatabasePromise("Failed to update anime path", () =>
      db.update(anime).set({ rootFolder: canonicalPath }).where(eq(anime.id, id)),
    );

    yield* appendSystemLog(
      db,
      "anime.path.updated",
      "success",
      `Updated path for anime ${id}`,
      nowIso,
    );
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
    yield* tryDatabasePromise("Failed to update anime", () =>
      db.update(anime).set({ profileName }).where(eq(anime.id, id)),
    );
    const message = `Updated profile for anime ${id}`;
    yield* appendSystemLog(db, "anime.updated", "success", message, nowIso);
    yield* eventPublisher.publishInfo(message);
  });

  const updateReleaseProfiles = Effect.fn("AnimeSettingsService.updateReleaseProfiles")(function* (
    id: number,
    releaseProfileIds: number[],
  ) {
    yield* requireAnimeExistsEffect(db, id);
    const encodedReleaseProfileIds = yield* encodeNumberList(releaseProfileIds).pipe(
      Effect.mapError(
        () => new AnimeStoredDataError({ message: "Anime release profile ids are invalid" }),
      ),
    );

    yield* tryDatabasePromise("Failed to update anime", () =>
      db
        .update(anime)
        .set({
          releaseProfileIds: encodedReleaseProfileIds,
        })
        .where(eq(anime.id, id)),
    );
    const message = `Updated release profiles for anime ${id}`;
    yield* appendSystemLog(db, "anime.updated", "success", message, nowIso);
    yield* eventPublisher.publishInfo(message);
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
