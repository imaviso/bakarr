import { HttpClient } from "@effect/platform";
import { Context, Effect, Layer } from "effect";

import type { Anime } from "../../../../../packages/shared/src/index.ts";
import { Database, DatabaseError } from "../../db/database.ts";
import { EventPublisher } from "../events/publisher.ts";
import { ClockService, nowIsoFromClock } from "../../lib/clock.ts";
import { AniListClient } from "./anilist.ts";
import type { AddAnimeInput } from "./add-anime-input.ts";
import {
  AnimeConflictError,
  AnimeNotFoundError,
  AnimePathError,
  type AnimeServiceError,
  AnimeStoredDataError,
} from "./errors.ts";
import { ProfileNotFoundError } from "../system/errors.ts";
import { ExternalCallError } from "../../lib/effect-retry.ts";
import { FileSystem } from "../../lib/filesystem.ts";
import { addAnimeEffect } from "./add-anime-support.ts";
import { deleteAnimeEffect } from "./delete-support.ts";
import {
  setAnimeMonitoredEffect,
  updateAnimePathEffect,
  updateAnimeProfileEffect,
  updateAnimeReleaseProfilesEffect,
} from "./mutation-support.ts";
import { refreshEpisodesEffect } from "./orchestration-support.ts";
import { makeMetadataRefreshRunner } from "./metadata-refresh.ts";

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
  readonly refreshMetadataForMonitoredAnime: () => Effect.Effect<
    { refreshed: number },
    DatabaseError | ExternalCallError | AnimeServiceError
  >;
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
    const metadataRefreshRunner = yield* makeMetadataRefreshRunner();

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
      refreshMetadataForMonitoredAnime: Effect.fn(
        "AnimeMutationService.refreshMetadataForMonitoredAnime",
      )(function* () {
        return yield* metadataRefreshRunner.trigger;
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
