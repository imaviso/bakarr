import { Effect } from "effect";

import { AppDrizzleDatabase, type DatabaseError } from "@/db/database.ts";
import { AnimeImageCacheService } from "@/features/media/metadata/media-image-cache-service.ts";
import { EventBus } from "@/features/events/event-bus.ts";
import { nowIso as currentNowIso } from "@/infra/time.ts";
import { AnimeMetadataProviderService } from "@/features/media/metadata/media-metadata-provider-service.ts";
import { FileSystem } from "@/infra/filesystem/filesystem.ts";
import { SearchBackgroundMissingService } from "@/features/operations/background-search/background-search-missing-support.ts";
import { OperationsTaskLauncherService } from "@/features/operations/tasks/operations-task-launcher-service.ts";
import { InfrastructureError } from "@/features/errors.ts";
import type { DomainNotFoundError } from "@/features/errors.ts";
import type { AddAnimeInput } from "@/features/media/add/add-media-input.ts";
import type { MediaServiceError } from "@/features/media/errors.ts";
import { addAnimeEffect } from "@/features/media/add/media-add.ts";
import { MediaReadRepository } from "@/features/media/shared/media-read-repository.ts";
import { MediaUnitRepository } from "@/features/media/units/media-unit-repository.ts";

export type AnimeEnrollmentError =
  | DatabaseError
  | MediaServiceError
  | DomainNotFoundError
  | InfrastructureError;

const makeAnimeEnrollmentService = Effect.fn("AnimeEnrollmentService.make")(function* () {
  const db = yield* AppDrizzleDatabase;
  const eventBus = yield* EventBus;
  const metadataProvider = yield* AnimeMetadataProviderService;
  const imageCacheService = yield* AnimeImageCacheService;
  const fs = yield* FileSystem;
  const mediaReadRepository = yield* MediaReadRepository;
  const mediaUnitRepository = yield* MediaUnitRepository;
  const searchBackgroundService = yield* SearchBackgroundMissingService;
  const taskLauncher = yield* OperationsTaskLauncherService;

  const enroll = Effect.fn("AnimeEnrollmentService.enroll")(function* (input: AddAnimeInput) {
    const media = yield* addAnimeEffect({
      metadataProvider,
      animeInput: input,
      db,
      eventPublisher: eventBus,
      fs,
      imageCacheService,
      mediaReadRepository,
      mediaUnitRepository,
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

export class AnimeEnrollmentService extends Effect.Service<AnimeEnrollmentService>()(
  "@bakarr/api/AnimeEnrollmentService",
  {
    effect: makeAnimeEnrollmentService(),
  },
) {}

export const AnimeEnrollmentServiceLive = AnimeEnrollmentService.Default;
