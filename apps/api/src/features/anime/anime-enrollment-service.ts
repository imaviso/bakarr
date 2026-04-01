import { Context, Effect, Layer } from "effect";
import { HttpClient } from "@effect/platform";

import type { Anime } from "@packages/shared/index.ts";
import { Database, type DatabaseError } from "@/db/database.ts";
import { EventPublisher } from "@/features/events/publisher.ts";
import { ClockService, nowIsoFromClock } from "@/lib/clock.ts";
import { AniListClient } from "@/features/anime/anilist.ts";
import { FileSystem } from "@/lib/filesystem.ts";
import type { ExternalCallError } from "@/lib/effect-retry.ts";
import { RuntimeConfigSnapshotService } from "@/features/system/runtime-config-snapshot-service.ts";
import type {
  OperationsError,
  OperationsInfrastructureError,
  OperationsPathError,
  OperationsStoredDataError,
  RssFeedParseError,
  RssFeedRejectedError,
  RssFeedTooLargeError,
} from "@/features/operations/errors.ts";
import { SearchBackgroundMissingService } from "@/features/operations/background-search-missing-support.ts";
import type { ProfileNotFoundError } from "@/features/system/errors.ts";
import type { AddAnimeInput } from "@/features/anime/add-anime-input.ts";
import type { AnimeServiceError } from "@/features/anime/errors.ts";
import { addAnimeEffect } from "@/features/anime/anime-add.ts";

export type AnimeEnrollmentError =
  | DatabaseError
  | AnimeServiceError
  | ProfileNotFoundError
  | ExternalCallError
  | OperationsError
  | OperationsInfrastructureError
  | OperationsPathError
  | OperationsStoredDataError
  | RssFeedParseError
  | RssFeedRejectedError
  | RssFeedTooLargeError;

export interface AnimeEnrollmentServiceShape {
  /**
   * Add an anime entry and, when `monitor_and_search` is set, immediately
   * kick off a missing-episode search. This keeps cross-service orchestration
   * out of the HTTP layer.
   */
  readonly enroll: (
    input: AddAnimeInput,
  ) => Effect.Effect<Anime, AnimeEnrollmentError, RuntimeConfigSnapshotService>;
}

export class AnimeEnrollmentService extends Context.Tag("@bakarr/api/AnimeEnrollmentService")<
  AnimeEnrollmentService,
  AnimeEnrollmentServiceShape
>() {}

const makeAnimeEnrollmentService = Effect.gen(function* () {
  const { db } = yield* Database;
  const eventPublisher = yield* EventPublisher;
  const aniList = yield* AniListClient;
  const fs = yield* FileSystem;
  const httpClient = yield* HttpClient.HttpClient;
  const clock = yield* ClockService;
  const searchBackgroundService = yield* SearchBackgroundMissingService;

  const enroll = Effect.fn("AnimeEnrollmentService.enroll")(function* (input: AddAnimeInput) {
    const anime = yield* addAnimeEffect({
      aniList,
      animeInput: input,
      db,
      eventPublisher,
      fs,
      httpClient,
      nowIso: () => nowIsoFromClock(clock),
    });

    if (input.monitor_and_search) {
      yield* searchBackgroundService.triggerSearchMissing(anime.id);
    }

    return anime;
  });

  return { enroll } satisfies AnimeEnrollmentServiceShape;
});

export const AnimeEnrollmentServiceLive = Layer.effect(
  AnimeEnrollmentService,
  makeAnimeEnrollmentService,
);
