import { Effect } from "effect";

import type { DatabaseError } from "@/db/database.ts";
import { MediaImageCacheService } from "@/features/media/metadata/media-image-cache-service.ts";
import { EventBus } from "@/features/events/event-bus.ts";
import { nowIso as currentNowIso } from "@/infra/time.ts";
import { MediaMetadataProviderService } from "@/features/media/metadata/media-metadata-provider-service.ts";
import { FileSystem } from "@/infra/filesystem/filesystem.ts";
import { SearchBackgroundMissingService } from "@/features/operations/background-search/background-search-missing-service.ts";
import { OperationsTaskLauncherService } from "@/features/operations/tasks/operations-task-launcher-service.ts";
import { DomainPathError, InfrastructureError, StoredDataError } from "@/features/errors.ts";
import type { AddMediaInput } from "@/features/media/add/add-media-input.ts";
import {
  AniDbRuntimeConfigError,
  MediaConflictError,
  MediaNotFoundError,
} from "@/features/media/errors.ts";
import { addMediaEffect } from "@/features/media/add/media-add.ts";
import { MediaRepository } from "@/features/media/shared/media-repository.ts";
import { MediaUnitRepository } from "@/features/media/units/media-unit-repository.ts";
import { QualityProfileRepository } from "@/features/system/repository/quality-profile-repository.ts";
import { SystemConfigRepository } from "@/features/system/repository/system-config-repository.ts";
import type { ExternalCallError } from "@/infra/effect/retry.ts";

export type MediaEnrollmentError =
  | DatabaseError
  | MediaConflictError
  | MediaNotFoundError
  | ExternalCallError
  | StoredDataError
  | AniDbRuntimeConfigError
  | DomainPathError
  | InfrastructureError;

const makeMediaEnrollmentService = Effect.fn("MediaEnrollmentService.make")(function* () {
  const eventBus = yield* EventBus;
  const metadataProvider = yield* MediaMetadataProviderService;
  const imageCacheService = yield* MediaImageCacheService;
  const fs = yield* FileSystem;
  const mediaRepository = yield* MediaRepository;
  const mediaUnitRepository = yield* MediaUnitRepository;
  const qualityProfileRepository = yield* QualityProfileRepository;
  const systemConfigRepository = yield* SystemConfigRepository;
  const searchBackgroundService = yield* SearchBackgroundMissingService;
  const taskLauncher = yield* OperationsTaskLauncherService;

  const enroll = Effect.fn("MediaEnrollmentService.enroll")(function* (input: AddMediaInput) {
    const media = yield* addMediaEffect({
      metadataProvider,
      animeInput: input,
      eventPublisher: eventBus,
      fs,
      imageCacheService,
      mediaRepository,
      mediaUnitRepository,
      qualityProfileRepository,
      systemConfigRepository,
      nowIso: currentNowIso,
    });

    if (input.monitor_and_search) {
      yield* taskLauncher.launch({
        mediaId: media.id,
        failureMessage: `Post-enrollment missing-unit search failed for media ${media.id}`,
        operation: () => searchBackgroundService.triggerSearchMissing(media.id),
        queuedMessage: `Queued post-enrollment missing-unit search for media ${media.id}`,
        runningMessage: `Searching missing mediaUnits for media ${media.id}`,
        successMessage: () => `Finished post-enrollment missing-unit search for media ${media.id}`,
        taskKey: "downloads_search_missing_manual",
      });
    }

    return media;
  });

  return { enroll };
});

export class MediaEnrollmentService extends Effect.Service<MediaEnrollmentService>()(
  "@bakarr/api/MediaEnrollmentService",
  {
    effect: makeMediaEnrollmentService(),
  },
) {}

export const MediaEnrollmentServiceLive = MediaEnrollmentService.Default;
