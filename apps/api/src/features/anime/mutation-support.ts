import { eq } from "drizzle-orm";
import { Effect } from "effect";

import type { AppDatabase } from "../../db/database.ts";
import { anime } from "../../db/schema.ts";
import type { FileSystemShape } from "../../lib/filesystem.ts";
import { encodeNumberList } from "../system/config-codec.ts";
import { ProfileNotFoundError } from "../system/errors.ts";
import type { EventPublisherShape } from "../events/publisher.ts";
import { AnimeConflictError, AnimePathError } from "./errors.ts";
import {
  appendAnimeLog,
  findAnimeRootFolderOwner,
  qualityProfileExists,
  requireAnimeExists,
} from "./repository.ts";
import {
  tryAnimePromise,
  tryDatabasePromise,
  updateAnimeRow,
} from "./service-support.ts";

type AnimeInfoPublisher = Pick<EventPublisherShape, "publishInfo">;

export const updateAnimePathEffect = Effect.fn(
  "AnimeService.updateAnimePathEffect",
)(function* (input: {
  db: AppDatabase;
  fs: FileSystemShape;
  id: number;
  path: string;
}) {
  const trimmedPath = input.path.trim();
  yield* tryAnimePromise(
    "Failed to update anime path",
    () => requireAnimeExists(input.db, input.id),
  );

  yield* input.fs.mkdir(trimmedPath, { recursive: true }).pipe(
    Effect.mapError(() =>
      new AnimePathError({
        message: "Failed to create or access the requested anime path",
      })
    ),
  );

  const canonicalPath = yield* input.fs.realPath(trimmedPath).pipe(
    Effect.mapError(() =>
      new AnimePathError({
        message: "Path does not exist or is inaccessible",
      })
    ),
  );

  const existingRootOwner = yield* tryDatabasePromise(
    "Failed to update anime path",
    () => findAnimeRootFolderOwner(input.db, canonicalPath),
  );

  if (existingRootOwner && existingRootOwner.id !== input.id) {
    return yield* new AnimeConflictError({
      message: `Folder is already mapped to ${existingRootOwner.titleRomaji}`,
    });
  }

  yield* tryAnimePromise(
    "Failed to update anime path",
    () =>
      input.db.update(anime).set({ rootFolder: canonicalPath }).where(
        eq(anime.id, input.id),
      ),
  );
  yield* tryDatabasePromise(
    "Failed to update anime path",
    () =>
      appendAnimeLog(
        input.db,
        "anime.path.updated",
        "success",
        `Updated path for anime ${input.id}`,
      ),
  );
});

export const updateAnimeProfileEffect = Effect.fn(
  "AnimeService.updateAnimeProfileEffect",
)(function* (input: {
  db: AppDatabase;
  eventPublisher: AnimeInfoPublisher;
  id: number;
  profileName: string;
}) {
  const profileExists = yield* tryDatabasePromise(
    "Failed to update anime profile",
    () => qualityProfileExists(input.db, input.profileName),
  );

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
  );
});

export const setAnimeMonitoredEffect = Effect.fn(
  "AnimeService.setAnimeMonitoredEffect",
)(function* (input: {
  db: AppDatabase;
  eventPublisher: AnimeInfoPublisher;
  id: number;
  monitored: boolean;
}) {
  yield* updateAnimeRow(
    input.db,
    input.id,
    { monitored: input.monitored },
    `Anime ${input.id} monitoring updated`,
    input.eventPublisher,
  );
});

export const updateAnimeReleaseProfilesEffect = Effect.fn(
  "AnimeService.updateAnimeReleaseProfilesEffect",
)(function* (input: {
  db: AppDatabase;
  eventPublisher: AnimeInfoPublisher;
  id: number;
  releaseProfileIds: number[];
}) {
  yield* updateAnimeRow(
    input.db,
    input.id,
    { releaseProfileIds: encodeNumberList(input.releaseProfileIds) },
    `Updated release profiles for anime ${input.id}`,
    input.eventPublisher,
  );
});
