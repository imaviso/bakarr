import { eq } from "drizzle-orm";
import { Effect } from "effect";
import { win32 as PathForUtilities } from "node:path";

import type { AppDatabase } from "../../db/database.ts";
import { anime } from "../../db/schema.ts";
import { isWithinPathRoot, type FileSystemShape } from "../../lib/filesystem.ts";
import { encodeNumberList } from "../system/config-codec.ts";
import { ProfileNotFoundError } from "../system/errors.ts";
import type { EventPublisherShape } from "../events/publisher.ts";
import { AnimeConflictError, AnimePathError } from "./errors.ts";
import { findAnimeRootFolderOwnerEffect, requireAnimeExistsEffect } from "./repository.ts";
import { getConfiguredLibraryPathEffect } from "./config-support.ts";
import { qualityProfileExistsEffect } from "./profile-support.ts";
import { tryDatabasePromise, updateAnimeRow, wrapAnimeError } from "./service-support.ts";
import { appendSystemLog } from "../system/support.ts";

type AnimeInfoPublisher = Pick<EventPublisherShape, "publishInfo">;

export const updateAnimePathEffect = Effect.fn("AnimeService.updateAnimePathEffect")(
  function* (input: {
    db: AppDatabase;
    fs: FileSystemShape;
    id: number;
    path: string;
    nowIso: () => Effect.Effect<string>;
  }) {
    const trimmedPath = input.path.trim();
    const configuredLibraryPath = yield* getConfiguredLibraryPathEffect(input.db).pipe(
      Effect.mapError(
        () =>
          new AnimePathError({
            message: "Configured library root is inaccessible",
          }),
      ),
    );
    const canonicalLibraryRoot = yield* resolveConfiguredLibraryRootEffect(
      input.fs,
      configuredLibraryPath,
    );

    yield* assertAnimePathWithinLibraryRootEffect(input.fs, trimmedPath, canonicalLibraryRoot);
    yield* requireAnimeExistsEffect(input.db, input.id).pipe(
      Effect.mapError(wrapAnimeError("Failed to update anime path")),
    );

    yield* input.fs.mkdir(trimmedPath, { recursive: true }).pipe(
      Effect.mapError(
        () =>
          new AnimePathError({
            message: "Failed to create or access the requested anime path",
          }),
      ),
    );

    const canonicalPath = yield* input.fs.realPath(trimmedPath).pipe(
      Effect.mapError(
        () =>
          new AnimePathError({
            message: "Path does not exist or is inaccessible",
          }),
      ),
    );

    const existingRootOwner = yield* findAnimeRootFolderOwnerEffect(input.db, canonicalPath);

    if (existingRootOwner && existingRootOwner.id !== input.id) {
      return yield* new AnimeConflictError({
        message: `Folder is already mapped to ${existingRootOwner.titleRomaji}`,
      });
    }

    yield* tryDatabasePromise("Failed to update anime path", () =>
      input.db.update(anime).set({ rootFolder: canonicalPath }).where(eq(anime.id, input.id)),
    );
    yield* appendSystemLog(
      input.db,
      "anime.path.updated",
      "success",
      `Updated path for anime ${input.id}`,
      input.nowIso,
    );
  },
);

const assertAnimePathWithinLibraryRootEffect = Effect.fn(
  "AnimeService.assertAnimePathWithinLibraryRoot",
)(function* (fs: FileSystemShape, path: string, libraryRoot: string) {
  const resolvedPath = yield* Effect.either(fs.realPath(path));

  if (resolvedPath._tag === "Right") {
    if (!isWithinPathRoot(resolvedPath.right, libraryRoot)) {
      return yield* new AnimePathError({
        message: "Anime path must be within the configured library root",
      });
    }

    return resolvedPath.right;
  }

  const canonicalParent = yield* findExistingAncestorPathEffect(fs, path);

  if (!isWithinPathRoot(canonicalParent, libraryRoot)) {
    return yield* new AnimePathError({
      message: "Anime path must be within the configured library root",
    });
  }

  return path;
});

const findExistingAncestorPathEffect = Effect.fn("AnimeService.findExistingAncestorPath")(
  function* (fs: FileSystemShape, path: string) {
    let current = path;

    while (true) {
      const resolved = yield* Effect.either(fs.realPath(current));

      if (resolved._tag === "Right") {
        return resolved.right;
      }

      const parent = PathForUtilities.dirname(current.replace(/[\\/]+/g, "/"));

      if (parent === current) {
        return yield* new AnimePathError({
          message: "Anime path must be within the configured library root",
        });
      }

      current = parent;
    }
  },
);

const resolveConfiguredLibraryRootEffect = Effect.fn("AnimeService.resolveConfiguredLibraryRoot")(
  function* (fs: FileSystemShape, configuredLibraryPath: string) {
    const resolved = yield* Effect.either(fs.realPath(configuredLibraryPath));

    if (resolved._tag === "Right") {
      return resolved.right;
    }

    return configuredLibraryPath;
  },
);

export const updateAnimeProfileEffect = Effect.fn("AnimeService.updateAnimeProfileEffect")(
  function* (input: {
    db: AppDatabase;
    eventPublisher: AnimeInfoPublisher;
    id: number;
    nowIso: () => Effect.Effect<string>;
    profileName: string;
  }) {
    const profileExists = yield* qualityProfileExistsEffect(input.db, input.profileName);

    if (!profileExists) {
      return yield* new ProfileNotFoundError({
        message: `Quality profile '${input.profileName}' not found`,
      });
    }

    yield* updateAnimeRow(
      input.db,
      input.id,
      { profileName: input.profileName },
      `Updated profile for anime ${input.id}`,
      input.eventPublisher,
      input.nowIso,
    );
  },
);

export const setAnimeMonitoredEffect = Effect.fn("AnimeService.setAnimeMonitoredEffect")(
  function* (input: {
    db: AppDatabase;
    eventPublisher: AnimeInfoPublisher;
    id: number;
    monitored: boolean;
    nowIso: () => Effect.Effect<string>;
  }) {
    yield* updateAnimeRow(
      input.db,
      input.id,
      { monitored: input.monitored },
      `Anime ${input.id} monitoring updated`,
      input.eventPublisher,
      input.nowIso,
    );
  },
);

export const updateAnimeReleaseProfilesEffect = Effect.fn(
  "AnimeService.updateAnimeReleaseProfilesEffect",
)(function* (input: {
  db: AppDatabase;
  eventPublisher: AnimeInfoPublisher;
  id: number;
  nowIso: () => Effect.Effect<string>;
  releaseProfileIds: number[];
}) {
  yield* updateAnimeRow(
    input.db,
    input.id,
    { releaseProfileIds: encodeNumberList(input.releaseProfileIds) },
    `Updated release profiles for anime ${input.id}`,
    input.eventPublisher,
    input.nowIso,
  );
});
