import { HttpClient } from "@effect/platform";
import { Context, Effect, Layer } from "effect";

import type { Anime } from "@packages/shared/index.ts";
import { Database, DatabaseError } from "@/db/database.ts";
import { EventPublisher } from "@/features/events/publisher.ts";
import { ClockService, nowIsoFromClock } from "@/lib/clock.ts";
import { AniListClient } from "@/features/anime/anilist.ts";
import type { AddAnimeInput } from "@/features/anime/add-anime-input.ts";
import {
  AnimeConflictError,
  AnimeNotFoundError,
  AnimePathError,
  AnimeStoredDataError,
} from "@/features/anime/errors.ts";
import { ProfileNotFoundError } from "@/features/system/errors.ts";
import { ExternalCallError } from "@/lib/effect-retry.ts";
import { FileSystem } from "@/lib/filesystem.ts";
import { addAnimeEffect } from "@/features/anime/add-anime-support.ts";

export interface AnimeCreateServiceShape {
  readonly addAnime: (
    input: AddAnimeInput,
  ) => Effect.Effect<
    Anime,
    | AnimeNotFoundError
    | AnimeConflictError
    | AnimePathError
    | AnimeStoredDataError
    | ProfileNotFoundError
    | DatabaseError
    | ExternalCallError
  >;
}

export class AnimeCreateService extends Context.Tag("@bakarr/api/AnimeCreateService")<
  AnimeCreateService,
  AnimeCreateServiceShape
>() {}

const makeAnimeCreateService = Effect.gen(function* () {
  const { db } = yield* Database;
  const eventPublisher = yield* EventPublisher;
  const aniList = yield* AniListClient;
  const fs = yield* FileSystem;
  const httpClient = yield* HttpClient.HttpClient;
  const clock = yield* ClockService;

  const addAnime = Effect.fn("AnimeCreateService.addAnime")(function* (input: AddAnimeInput) {
    return yield* addAnimeEffect({
      aniList,
      animeInput: input,
      db,
      eventPublisher,
      fs,
      httpClient,
      nowIso: () => nowIsoFromClock(clock),
    });
  });

  return { addAnime } satisfies AnimeCreateServiceShape;
});

export const AnimeCreateServiceLive = Layer.effect(AnimeCreateService, makeAnimeCreateService);
