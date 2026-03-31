import { Context, Effect, Layer } from "effect";

import type { DatabaseError } from "@/db/database.ts";
import { Database } from "@/db/database.ts";
import { EventPublisher } from "@/features/events/publisher.ts";
import { ClockService, nowIsoFromClock } from "@/lib/clock.ts";
import { FileSystem } from "@/lib/filesystem.ts";
import {
  setAnimeMonitoredEffect,
  updateAnimePathEffect,
  updateAnimeProfileEffect,
  updateAnimeReleaseProfilesEffect,
} from "@/features/anime/mutation-support.ts";
import type { AnimeServiceError } from "@/features/anime/errors.ts";
import { ProfileNotFoundError } from "@/features/system/errors.ts";

export interface AnimeSettingsServiceShape {
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
}

export class AnimeSettingsService extends Context.Tag("@bakarr/api/AnimeSettingsService")<
  AnimeSettingsService,
  AnimeSettingsServiceShape
>() {}

const makeAnimeSettingsService = Effect.gen(function* () {
  const { db } = yield* Database;
  const eventPublisher = yield* EventPublisher;
  const fs = yield* FileSystem;
  const clock = yield* ClockService;

  const setMonitored = Effect.fn("AnimeSettingsService.setMonitored")(function* (
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
  });

  const updatePath = Effect.fn("AnimeSettingsService.updatePath")(function* (
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
  });

  const updateProfile = Effect.fn("AnimeSettingsService.updateProfile")(function* (
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
  });

  const updateReleaseProfiles = Effect.fn("AnimeSettingsService.updateReleaseProfiles")(function* (
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
  });

  return {
    setMonitored,
    updatePath,
    updateProfile,
    updateReleaseProfiles,
  } satisfies AnimeSettingsServiceShape;
});

export const AnimeSettingsServiceLive = Layer.effect(
  AnimeSettingsService,
  makeAnimeSettingsService,
);
