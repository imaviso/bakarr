import { Effect } from "effect";

import type { DatabaseError } from "@/db/database.ts";
import { EventBus } from "@/features/events/event-bus.ts";
import { nowIso as currentNowIso } from "@/infra/time.ts";
import { FileSystem } from "@/infra/filesystem/filesystem.ts";
import { encodeNumberList } from "@/features/system/profile-codec.ts";
import { getConfiguredLibraryPathEffect } from "@/features/media/shared/config-support.ts";
import {
  resolveConfiguredLibraryRoot,
  assertPathWithinLibraryRoot,
} from "@/features/media/shared/media-path-policy.ts";
import { MediaRepository } from "@/features/media/shared/media-repository.ts";
import { DomainPathError } from "@/features/errors.ts";
import { MediaConflictError, MediaNotFoundError } from "@/features/media/errors.ts";
import { StoredDataError } from "@/features/errors.ts";
import { SystemLogRepository } from "@/features/system/repository/log-repository.ts";
import { QualityProfileRepository } from "@/features/system/repository/quality-profile-repository.ts";
import { SystemConfigRepository } from "@/features/system/repository/system-config-repository.ts";

export interface MediaSettingsServiceShape {
  readonly setMonitored: (
    id: number,
    monitored: boolean,
  ) => Effect.Effect<void, DatabaseError | MediaNotFoundError>;
  readonly updatePath: (
    id: number,
    path: string,
  ) => Effect.Effect<
    void,
    DatabaseError | MediaNotFoundError | MediaConflictError | DomainPathError
  >;
  readonly updateProfile: (
    id: number,
    profileName: string,
  ) => Effect.Effect<void, DatabaseError | MediaNotFoundError>;
  readonly updateReleaseProfiles: (
    id: number,
    releaseProfileIds: number[],
  ) => Effect.Effect<void, DatabaseError | MediaNotFoundError | StoredDataError>;
}

const makeMediaSettingsService = Effect.fn("MediaSettingsService.make")(function* () {
  const eventBus = yield* EventBus;
  const fs = yield* FileSystem;
  const mediaReadRepository = yield* MediaRepository;
  const qualityProfileRepository = yield* QualityProfileRepository;
  const systemConfigRepository = yield* SystemConfigRepository;
  const systemLogRepository = yield* SystemLogRepository;
  const nowIso = currentNowIso;

  const setMonitored = Effect.fn("MediaSettingsService.setMonitored")(function* (
    id: number,
    monitored: boolean,
  ) {
    yield* mediaReadRepository.requireMediaExists(id);
    yield* mediaReadRepository.updateMonitored(id, monitored);
    const message = `Media ${id} monitoring updated`;
    yield* systemLogRepository.appendLog("media.updated", "success", message, nowIso);
    yield* eventBus.publishInfo(message);
  });

  const updatePath = Effect.fn("MediaSettingsService.updatePath")(function* (
    id: number,
    path: string,
  ) {
    const trimmedPath = path.trim();

    const configuredLibraryPath = yield* getConfiguredLibraryPathEffect(
      systemConfigRepository,
    ).pipe(
      Effect.mapError(
        (cause) =>
          new DomainPathError({
            cause,
            message: "Configured library root is inaccessible",
          }),
      ),
    );

    const canonicalLibraryRoot = yield* resolveConfiguredLibraryRoot(fs, configuredLibraryPath);

    yield* assertPathWithinLibraryRoot(fs, trimmedPath, canonicalLibraryRoot);
    yield* mediaReadRepository.requireMediaExists(id);

    yield* fs.mkdir(trimmedPath, { recursive: true }).pipe(
      Effect.mapError(
        (cause) =>
          new DomainPathError({
            cause,
            message: "Failed to create or access the requested media path",
          }),
      ),
    );

    const canonicalPath = yield* fs.realPath(trimmedPath).pipe(
      Effect.mapError(
        (cause) =>
          new DomainPathError({
            cause,
            message: "Path does not exist or is inaccessible",
          }),
      ),
    );

    const existingRootOwner = yield* mediaReadRepository.findMediaRootFolderOwner(canonicalPath);

    if (existingRootOwner && existingRootOwner.id !== id) {
      return yield* new MediaConflictError({
        message: `Folder is already mapped to ${existingRootOwner.titleRomaji}`,
      });
    }

    yield* mediaReadRepository.updateRootFolder(id, canonicalPath);

    yield* systemLogRepository.appendLog(
      "media.path.updated",
      "success",
      `Updated path for media ${id}`,
      nowIso,
    );

    yield* eventBus.publishInfo(`Updated path for media ${id}`);
    return undefined;
  });

  const updateProfile = Effect.fn("MediaSettingsService.updateProfile")(function* (
    id: number,
    profileName: string,
  ) {
    const profileExists = yield* qualityProfileRepository.qualityProfileExists(profileName);

    if (!profileExists) {
      return yield* new MediaNotFoundError({
        message: `Quality profile '${profileName}' not found`,
      });
    }

    yield* mediaReadRepository.requireMediaExists(id);
    yield* mediaReadRepository.updateProfileName(id, profileName);
    const message = `Updated profile for media ${id}`;
    yield* systemLogRepository.appendLog("media.updated", "success", message, nowIso);
    yield* eventBus.publishInfo(message);
    return undefined;
  });

  const updateReleaseProfiles = Effect.fn("MediaSettingsService.updateReleaseProfiles")(function* (
    id: number,
    releaseProfileIds: number[],
  ) {
    yield* mediaReadRepository.requireMediaExists(id);
    const encodedReleaseProfileIds = yield* encodeNumberList(releaseProfileIds).pipe(
      Effect.mapError(
        (cause) =>
          new StoredDataError({
            cause,
            message: "Media release profile ids are invalid",
          }),
      ),
    );

    yield* mediaReadRepository.updateReleaseProfileIds(id, encodedReleaseProfileIds);
    const message = `Updated release profiles for media ${id}`;
    yield* systemLogRepository.appendLog("media.updated", "success", message, nowIso);
    yield* eventBus.publishInfo(message);
  });

  return {
    setMonitored,
    updatePath,
    updateProfile,
    updateReleaseProfiles,
  } satisfies MediaSettingsServiceShape;
});

export class MediaSettingsService extends Effect.Service<MediaSettingsService>()(
  "@bakarr/api/MediaSettingsService",
  {
    effect: makeMediaSettingsService(),
    dependencies: [
      MediaRepository.Default,
      QualityProfileRepository.Default,
      SystemConfigRepository.Default,
      SystemLogRepository.Default,
    ],
  },
) {}

export const MediaSettingsServiceLive = MediaSettingsService.Default;
