import { Context, Effect, Layer } from "effect";

import type { Anime } from "@packages/shared/index.ts";
import { Database, type DatabaseError } from "@/db/database.ts";
import { AnimeImageCacheService } from "@/features/anime/anime-image-cache-service.ts";
import { EventBus } from "@/features/events/event-bus.ts";
import { ClockService, nowIsoFromClock } from "@/infra/clock.ts";
import { AnimeMetadataProviderService } from "@/features/anime/anime-metadata-provider-service.ts";
import { FileSystem } from "@/infra/filesystem/filesystem.ts";
import { SearchBackgroundMissingService } from "@/features/operations/background-search-missing-support.ts";
import { OperationsTaskLauncherService } from "@/features/operations/operations-task-launcher-service.ts";
import { OperationsInfrastructureError } from "@/features/operations/errors.ts";
import type { ProfileNotFoundError } from "@/features/system/errors.ts";
import type { AddAnimeInput } from "@/features/anime/add-anime-input.ts";
import type { AnimeServiceError } from "@/features/anime/errors.ts";
import { addAnimeEffect } from "@/features/anime/anime-add.ts";

export type AnimeEnrollmentError =
  | DatabaseError
  | AnimeServiceError
  | ProfileNotFoundError
  | OperationsInfrastructureError;

export interface AnimeEnrollmentServiceShape {
  /**
   * Add an anime entry and, when `monitor_and_search` is set, immediately
   * kick off a missing-episode search. This keeps cross-service orchestration
   * out of the HTTP layer.
   */
  readonly enroll: (input: AddAnimeInput) => Effect.Effect<Anime, AnimeEnrollmentError>;
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
    const anime = yield* addAnimeEffect({
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
        animeId: anime.id,
        failureMessage: `Post-enrollment missing-episode search failed for anime ${anime.id}`,
        operation: () => searchBackgroundService.triggerSearchMissing(anime.id),
        queuedMessage: `Queued post-enrollment missing-episode search for anime ${anime.id}`,
        runningMessage: `Searching missing episodes for anime ${anime.id}`,
        successMessage: () =>
          `Finished post-enrollment missing-episode search for anime ${anime.id}`,
        taskKey: "downloads_search_missing_manual",
      });
    }

    return anime;
  });

  return { enroll } satisfies AnimeEnrollmentServiceShape;
});

export const AnimeEnrollmentServiceLive = Layer.effect(
  AnimeEnrollmentService,
  makeAnimeEnrollmentService,
);
