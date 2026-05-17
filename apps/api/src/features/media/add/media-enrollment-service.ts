import { Context, Effect, Layer } from "effect";

import type { Media } from "@packages/shared/index.ts";
import { Database, type DatabaseError } from "@/db/database.ts";
import { AnimeImageCacheService } from "@/features/media/metadata/media-image-cache-service.ts";
import { EventBus } from "@/features/events/event-bus.ts";
import { ClockService, nowIsoFromClock } from "@/infra/clock.ts";
import { AnimeMetadataProviderService } from "@/features/media/metadata/media-metadata-provider-service.ts";
import { FileSystem } from "@/infra/filesystem/filesystem.ts";
import { SearchBackgroundMissingService } from "@/features/operations/background-search/background-search-missing-support.ts";
import { OperationsTaskLauncherService } from "@/features/operations/tasks/operations-task-launcher-service.ts";
import { OperationsInfrastructureError } from "@/features/operations/errors.ts";
import type { ProfileNotFoundError } from "@/features/system/errors.ts";
import type { AddAnimeInput } from "@/features/media/add/add-media-input.ts";
import type { MediaServiceError } from "@/features/media/errors.ts";
import { addAnimeEffect } from "@/features/media/add/media-add.ts";

export type AnimeEnrollmentError =
  | DatabaseError
  | MediaServiceError
  | ProfileNotFoundError
  | OperationsInfrastructureError;

export interface AnimeEnrollmentServiceShape {
  /**
   * Add a media entry and, when `monitor_and_search` is set, immediately
   * kick off a missing-unit search. This keeps cross-service orchestration
   * out of the HTTP layer.
   */
  readonly enroll: (input: AddAnimeInput) => Effect.Effect<Media, AnimeEnrollmentError>;
}

export class AnimeEnrollmentService extends Context.Tag("@bakarr/api/AnimeEnrollmentService")<
  AnimeEnrollmentService,
  AnimeEnrollmentServiceShape
>() {}

const makeAnimeEnrollmentService = Effect.gen(function* () {
  const { db } = yield* Database;
  const eventBus = yield* EventBus;
  const metadataProvider = yield* AnimeMetadataProviderService;
  const imageCacheService = yield* AnimeImageCacheService;
  const fs = yield* FileSystem;
  const clock = yield* ClockService;
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
      nowIso: () => nowIsoFromClock(clock),
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

  return { enroll } satisfies AnimeEnrollmentServiceShape;
});

export const AnimeEnrollmentServiceLive = Layer.effect(
  AnimeEnrollmentService,
  makeAnimeEnrollmentService,
);
