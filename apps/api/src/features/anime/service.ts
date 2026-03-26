import { HttpClient } from "@effect/platform";
import { Context, Effect, Layer } from "effect";

import type {
  Anime,
  AnimeListQueryParams,
  AnimeListResponse,
  AnimeSearchResponse,
  AnimeSearchResult,
  Episode,
  VideoFile,
} from "../../../../../packages/shared/src/index.ts";
import { Database, DatabaseError } from "../../db/database.ts";
import { EventPublisher } from "../events/publisher.ts";
import { nowIsoFromClock, ClockService } from "../../lib/clock.ts";
import type { AddAnimeInput } from "./add-anime-input.ts";
import { AniListClient } from "./anilist.ts";
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
import { MediaProbe } from "../../lib/media-probe.ts";
import { addAnimeEffect } from "./add-anime-support.ts";
import { deleteAnimeEffect } from "./delete-support.ts";
import type { EpisodeFileResolution } from "./file-mapping-support.ts";
import {
  setAnimeMonitoredEffect,
  updateAnimePathEffect,
  updateAnimeProfileEffect,
  updateAnimeReleaseProfilesEffect,
} from "./mutation-support.ts";
import {
  refreshEpisodesEffect,
  scanAnimeFolderOrchestrationEffect,
} from "./orchestration-support.ts";
import {
  getAnimeByAnilistIdEffect,
  getAnimeEffect,
  listAnimeEffect,
  listEpisodesEffect,
  searchAnimeEffect,
} from "./query-support.ts";
import { makeMetadataRefreshRunner } from "./service-support.ts";
import { makeAnimeFileOperations } from "./service-wiring.ts";

export interface AnimeServiceShape {
  readonly listAnime: (
    params?: AnimeListQueryParams,
  ) => Effect.Effect<AnimeListResponse, DatabaseError | AnimeStoredDataError>;
  readonly getAnime: (id: number) => Effect.Effect<Anime, AnimeServiceError | DatabaseError>;
  readonly searchAnime: (
    query: string,
  ) => Effect.Effect<AnimeSearchResponse, DatabaseError | ExternalCallError | AnimeStoredDataError>;
  readonly getAnimeByAnilistId: (
    id: number,
  ) => Effect.Effect<AnimeSearchResult, AnimeNotFoundError | DatabaseError | ExternalCallError>;
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
  readonly listEpisodes: (animeId: number) => Effect.Effect<Episode[], DatabaseError>;
  readonly resolveEpisodeFile: (
    animeId: number,
    episodeNumber: number,
  ) => Effect.Effect<EpisodeFileResolution, AnimeServiceError | DatabaseError>;
  readonly refreshEpisodes: (
    animeId: number,
  ) => Effect.Effect<void, AnimeServiceError | DatabaseError | ExternalCallError>;
  readonly refreshMetadataForMonitoredAnime: () => Effect.Effect<
    { refreshed: number },
    DatabaseError | ExternalCallError | AnimeServiceError
  >;
  readonly scanFolder: (
    animeId: number,
  ) => Effect.Effect<{ found: number; total: number }, AnimeServiceError | DatabaseError>;
  readonly deleteEpisodeFile: (
    animeId: number,
    episodeNumber: number,
  ) => Effect.Effect<void, AnimeServiceError | DatabaseError>;
  readonly mapEpisode: (
    animeId: number,
    episodeNumber: number,
    filePath: string,
  ) => Effect.Effect<void, AnimeServiceError | DatabaseError>;
  readonly bulkMapEpisodes: (
    animeId: number,
    mappings: readonly { episode_number: number; file_path: string }[],
  ) => Effect.Effect<void, AnimeServiceError | DatabaseError>;
  readonly listFiles: (
    animeId: number,
  ) => Effect.Effect<VideoFile[], AnimeServiceError | DatabaseError>;
}

export class AnimeService extends Context.Tag("@bakarr/api/AnimeService")<
  AnimeService,
  AnimeServiceShape
>() {}

const makeAnimeService = Effect.gen(function* () {
  const { db } = yield* Database;
  const eventPublisher = yield* EventPublisher;
  const aniList = yield* AniListClient;
  const fs = yield* FileSystem;
  const mediaProbe = yield* MediaProbe;
  const httpClient = yield* HttpClient.HttpClient;
  const clock = yield* ClockService;
  const metadataRefreshRunner = yield* makeMetadataRefreshRunner({
    aniList,
    db,
    nowIso: () => nowIsoFromClock(clock),
  });
  const {
    bulkMapEpisodes: bulkMapEpisodesEffect,
    deleteEpisodeFile: deleteEpisodeFileEffect,
    listFiles: listFilesEffect,
    mapEpisode: mapEpisodeEffect,
    resolveEpisodeFile: resolveEpisodeFileEffect,
  } = makeAnimeFileOperations({ db, fs, mediaProbe });

  const addAnime = Effect.fn("AnimeService.addAnime")(function* (input: AddAnimeInput) {
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

  const listAnime = Effect.fn("AnimeService.listAnime")(function* (params?: AnimeListQueryParams) {
    return yield* listAnimeEffect(db, params);
  });
  const getAnime = Effect.fn("AnimeService.getAnime")(function* (id: number) {
    return yield* getAnimeEffect({ db, id });
  });
  const searchAnime = Effect.fn("AnimeService.searchAnime")(function* (query: string) {
    return yield* searchAnimeEffect({ aniList, db, query });
  });
  const getAnimeByAnilistId = Effect.fn("AnimeService.getAnimeByAnilistId")(function* (id: number) {
    return yield* getAnimeByAnilistIdEffect({ aniList, db, id });
  });
  const listEpisodes = Effect.fn("AnimeService.listEpisodes")(function* (animeId: number) {
    const now = new Date(yield* clock.currentTimeMillis);
    return yield* listEpisodesEffect({ animeId, db, now });
  });
  const refreshEpisodes = Effect.fn("AnimeService.refreshEpisodes")(function* (animeId: number) {
    return yield* refreshEpisodesEffect({
      aniList,
      animeId,
      db,
      eventPublisher,
      nowIso: () => nowIsoFromClock(clock),
    });
  });
  const refreshMetadataForMonitoredAnime = Effect.fn(
    "AnimeService.refreshMetadataForMonitoredAnime",
  )(function* () {
    return yield* metadataRefreshRunner.trigger;
  });
  const scanFolder = Effect.fn("AnimeService.scanFolder")(function* (animeId: number) {
    return yield* scanAnimeFolderOrchestrationEffect({
      animeId,
      db,
      eventPublisher,
      fs,
      mediaProbe,
      nowIso: () => nowIsoFromClock(clock),
    });
  });
  const deleteAnime = Effect.fn("AnimeService.deleteAnime")(function* (id: number) {
    return yield* deleteAnimeEffect(db, id, () => nowIsoFromClock(clock));
  });

  const setMonitored = Effect.fn("AnimeService.setMonitored")(function* (
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
  const updatePath = Effect.fn("AnimeService.updatePath")(function* (id: number, path: string) {
    return yield* updateAnimePathEffect({
      db,
      fs,
      id,
      path,
      nowIso: () => nowIsoFromClock(clock),
    });
  });
  const updateProfile = Effect.fn("AnimeService.updateProfile")(function* (
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
  const updateReleaseProfiles = Effect.fn("AnimeService.updateReleaseProfiles")(function* (
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
  const resolveEpisodeFile = Effect.fn("AnimeService.resolveEpisodeFile")(function* (
    ...args: Parameters<typeof resolveEpisodeFileEffect>
  ) {
    return yield* resolveEpisodeFileEffect(...args);
  });
  const deleteEpisodeFile = Effect.fn("AnimeService.deleteEpisodeFile")(function* (
    ...args: Parameters<typeof deleteEpisodeFileEffect>
  ) {
    return yield* deleteEpisodeFileEffect(...args);
  });
  const mapEpisode = Effect.fn("AnimeService.mapEpisode")(function* (
    ...args: Parameters<typeof mapEpisodeEffect>
  ) {
    return yield* mapEpisodeEffect(...args);
  });
  const bulkMapEpisodes = Effect.fn("AnimeService.bulkMapEpisodes")(function* (
    ...args: Parameters<typeof bulkMapEpisodesEffect>
  ) {
    return yield* bulkMapEpisodesEffect(...args);
  });
  const listFiles = Effect.fn("AnimeService.listFiles")(function* (
    ...args: Parameters<typeof listFilesEffect>
  ) {
    return yield* listFilesEffect(...args);
  });

  return {
    listAnime,
    getAnime,
    searchAnime,
    getAnimeByAnilistId,
    addAnime,
    deleteAnime,
    setMonitored,
    updatePath,
    updateProfile,
    updateReleaseProfiles,
    listEpisodes,
    resolveEpisodeFile,
    refreshEpisodes,
    refreshMetadataForMonitoredAnime,
    scanFolder,
    deleteEpisodeFile,
    mapEpisode,
    bulkMapEpisodes,
    listFiles,
  } satisfies AnimeServiceShape;
});

export const AnimeServiceLive = Layer.effect(AnimeService, makeAnimeService);
