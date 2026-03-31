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
  type AnimeServiceError,
  AnimeStoredDataError,
} from "@/features/anime/errors.ts";
import { ProfileNotFoundError } from "@/features/system/errors.ts";
import { ExternalCallError } from "@/lib/effect-retry.ts";
import { FileSystem } from "@/lib/filesystem.ts";
import { addAnimeEffect } from "@/features/anime/add-anime-support.ts";
import { deleteAnimeEffect } from "@/features/anime/delete-support.ts";
import {
  setAnimeMonitoredEffect,
  updateAnimePathEffect,
  updateAnimeProfileEffect,
  updateAnimeReleaseProfilesEffect,
} from "@/features/anime/mutation-support.ts";
import { refreshEpisodesEffect } from "@/features/anime/anime-episode-refresh.ts";

export interface AnimeMutationServiceShape {
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
  readonly deleteAnime: (id: number) => Effect.Effect<void, DatabaseError>;
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
  ) => Effect.Effect<void, AnimeServiceError | DatabaseError>;
  readonly refreshEpisodes: (
    animeId: number,
  ) => Effect.Effect<void, AnimeServiceError | DatabaseError | ExternalCallError>;
}

export class AnimeMutationService extends Context.Tag("@bakarr/api/AnimeMutationService")<
  AnimeMutationService,
  AnimeMutationServiceShape
>() {}

export const AnimeMutationServiceLive = Layer.effect(
  AnimeMutationService,
  Effect.gen(function* () {
    const { db } = yield* Database;
    const eventPublisher = yield* EventPublisher;
    const aniList = yield* AniListClient;
    const fs = yield* FileSystem;
    const httpClient = yield* HttpClient.HttpClient;
    const clock = yield* ClockService;

    return {
      addAnime: Effect.fn("AnimeMutationService.addAnime")(function* (input: AddAnimeInput) {
        return yield* addAnimeEffect({
          aniList,
          animeInput: input,
          db,
          eventPublisher,
          fs,
          httpClient,
          nowIso: () => nowIsoFromClock(clock),
        });
      }),
      deleteAnime: Effect.fn("AnimeMutationService.deleteAnime")(function* (id: number) {
        return yield* deleteAnimeEffect(db, id, () => nowIsoFromClock(clock));
      }),
      refreshEpisodes: Effect.fn("AnimeMutationService.refreshEpisodes")(function* (
        animeId: number,
      ) {
        return yield* refreshEpisodesEffect({
          aniList,
          animeId,
          db,
          eventPublisher,
          nowIso: () => nowIsoFromClock(clock),
        });
      }),
      setMonitored: Effect.fn("AnimeMutationService.setMonitored")(function* (
        id: number,
        monitored: boolean,
      ) {
        return yield* setAnimeMonitoredEffect({
          db,
          eventPublisher,
          id,
          monitored,
          nowIso: () => nowIsoFromClock(clock),
        });
      }),
      updatePath: Effect.fn("AnimeMutationService.updatePath")(function* (
        id: number,
        path: string,
      ) {
        return yield* updateAnimePathEffect({
          db,
          fs,
          id,
          path,
          nowIso: () => nowIsoFromClock(clock),
        });
      }),
      updateProfile: Effect.fn("AnimeMutationService.updateProfile")(function* (
        id: number,
        profileName: string,
      ) {
        return yield* updateAnimeProfileEffect({
          db,
          eventPublisher,
          id,
          nowIso: () => nowIsoFromClock(clock),
          profileName,
        });
      }),
      updateReleaseProfiles: Effect.fn("AnimeMutationService.updateReleaseProfiles")(function* (
        id: number,
        releaseProfileIds: number[],
      ) {
        return yield* updateAnimeReleaseProfilesEffect({
          db,
          eventPublisher,
          id,
          nowIso: () => nowIsoFromClock(clock),
          releaseProfileIds,
        });
      }),
    } satisfies AnimeMutationServiceShape;
  }),
);
