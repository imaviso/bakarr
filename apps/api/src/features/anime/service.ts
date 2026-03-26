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

function wrapServiceEffect<Args extends ReadonlyArray<unknown>, Success, Error>(
  name: string,
  effect: (...args: Args) => Effect.Effect<Success, Error>,
): (...args: Args) => Effect.Effect<Success, Error> {
  return Effect.fn(name)(function* (...args: Args) {
    return yield* effect(...args);
  });
}

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

  const addAnime = wrapServiceEffect("AnimeService.addAnime", (input: AddAnimeInput) =>
    addAnimeEffect({
      aniList,
      animeInput: input,
      db,
      eventPublisher,
      fs,
      httpClient,
      nowIso: () => nowIsoFromClock(clock),
    }),
  );

  const listAnime = wrapServiceEffect("AnimeService.listAnime", (params?: AnimeListQueryParams) =>
    listAnimeEffect(db, params),
  );
  const getAnime = wrapServiceEffect("AnimeService.getAnime", (id: number) =>
    getAnimeEffect({ db, id }),
  );
  const searchAnime = wrapServiceEffect("AnimeService.searchAnime", (query: string) =>
    searchAnimeEffect({ aniList, db, query }),
  );
  const getAnimeByAnilistId = wrapServiceEffect("AnimeService.getAnimeByAnilistId", (id: number) =>
    getAnimeByAnilistIdEffect({ aniList, db, id }),
  );
  const listEpisodes = wrapServiceEffect("AnimeService.listEpisodes", (animeId: number) =>
    Effect.gen(function* () {
      const now = new Date(yield* clock.currentTimeMillis);
      return yield* listEpisodesEffect({ animeId, db, now });
    }),
  );
  const refreshEpisodes = wrapServiceEffect("AnimeService.refreshEpisodes", (animeId: number) =>
    refreshEpisodesEffect({
      aniList,
      animeId,
      db,
      eventPublisher,
      nowIso: () => nowIsoFromClock(clock),
    }),
  );
  const refreshMetadataForMonitoredAnime = wrapServiceEffect(
    "AnimeService.refreshMetadataForMonitoredAnime",
    () => metadataRefreshRunner.trigger,
  );
  const scanFolder = wrapServiceEffect("AnimeService.scanFolder", (animeId: number) =>
    scanAnimeFolderOrchestrationEffect({
      animeId,
      db,
      eventPublisher,
      fs,
      mediaProbe,
      nowIso: () => nowIsoFromClock(clock),
    }),
  );
  const deleteAnime = wrapServiceEffect("AnimeService.deleteAnime", (id: number) =>
    deleteAnimeEffect(db, id, () => nowIsoFromClock(clock)),
  );

  const setMonitored = wrapServiceEffect(
    "AnimeService.setMonitored",
    (id: number, monitored: boolean) =>
      setAnimeMonitoredEffect({
        db,
        eventPublisher,
        id,
        monitored,
        nowIso: () => nowIsoFromClock(clock),
      }),
  );
  const updatePath = wrapServiceEffect("AnimeService.updatePath", (id: number, path: string) =>
    updateAnimePathEffect({ db, fs, id, path, nowIso: () => nowIsoFromClock(clock) }),
  );
  const updateProfile = wrapServiceEffect(
    "AnimeService.updateProfile",
    (id: number, profileName: string) =>
      updateAnimeProfileEffect({
        db,
        eventPublisher,
        id,
        nowIso: () => nowIsoFromClock(clock),
        profileName,
      }),
  );
  const updateReleaseProfiles = wrapServiceEffect(
    "AnimeService.updateReleaseProfiles",
    (id: number, releaseProfileIds: number[]) =>
      updateAnimeReleaseProfilesEffect({
        db,
        eventPublisher,
        id,
        nowIso: () => nowIsoFromClock(clock),
        releaseProfileIds,
      }),
  );
  const resolveEpisodeFile = wrapServiceEffect(
    "AnimeService.resolveEpisodeFile",
    resolveEpisodeFileEffect,
  );
  const deleteEpisodeFile = wrapServiceEffect(
    "AnimeService.deleteEpisodeFile",
    deleteEpisodeFileEffect,
  );
  const mapEpisode = wrapServiceEffect("AnimeService.mapEpisode", mapEpisodeEffect);
  const bulkMapEpisodes = wrapServiceEffect("AnimeService.bulkMapEpisodes", bulkMapEpisodesEffect);
  const listFiles = wrapServiceEffect("AnimeService.listFiles", listFilesEffect);

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
