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

export interface AddAnimeInput {
  readonly id: number;
  readonly profile_name: string;
  readonly root_folder: string;
  readonly monitor_and_search: boolean;
  readonly monitored: boolean;
  readonly release_profile_ids: number[];
  readonly use_existing_root?: boolean;
}

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
  const metadataRefreshRunner = yield* makeMetadataRefreshRunner({
    aniList,
    db,
  });
  const { bulkMapEpisodes, deleteEpisodeFile, listFiles, mapEpisode, resolveEpisodeFile } =
    makeAnimeFileOperations({ db, fs, mediaProbe });

  const addAnime = Effect.fn("AnimeService.addAnime")(function* (input: AddAnimeInput) {
    return yield* addAnimeEffect({
      aniList,
      animeInput: input,
      db,
      eventPublisher,
      fs,
      httpClient,
    });
  });

  const listAnime: AnimeServiceShape["listAnime"] = (params) => listAnimeEffect(db, params);
  const getAnime: AnimeServiceShape["getAnime"] = (id) => getAnimeEffect({ db, id });
  const searchAnime: AnimeServiceShape["searchAnime"] = (query) =>
    searchAnimeEffect({ aniList, db, query });
  const getAnimeByAnilistId: AnimeServiceShape["getAnimeByAnilistId"] = (id) =>
    getAnimeByAnilistIdEffect({ aniList, db, id });
  const listEpisodes: AnimeServiceShape["listEpisodes"] = (animeId) =>
    listEpisodesEffect({ animeId, db });
  const refreshEpisodes: AnimeServiceShape["refreshEpisodes"] = (animeId) =>
    refreshEpisodesEffect({ aniList, animeId, db, eventPublisher });
  const refreshMetadataForMonitoredAnime: AnimeServiceShape["refreshMetadataForMonitoredAnime"] =
    () => metadataRefreshRunner.trigger;
  const scanFolder: AnimeServiceShape["scanFolder"] = (animeId) =>
    scanAnimeFolderOrchestrationEffect({
      animeId,
      db,
      eventPublisher,
      fs,
      mediaProbe,
    });
  const deleteAnime: AnimeServiceShape["deleteAnime"] = (id) => deleteAnimeEffect(db, id);

  const updatePath: AnimeServiceShape["updatePath"] = (id, path) =>
    updateAnimePathEffect({ db, fs, id, path });
  const updateProfile: AnimeServiceShape["updateProfile"] = (id, profileName) =>
    updateAnimeProfileEffect({ db, eventPublisher, id, profileName });
  const setMonitored: AnimeServiceShape["setMonitored"] = (id, monitored) =>
    setAnimeMonitoredEffect({ db, eventPublisher, id, monitored });
  const updateReleaseProfiles: AnimeServiceShape["updateReleaseProfiles"] = (
    id,
    releaseProfileIds,
  ) =>
    updateAnimeReleaseProfilesEffect({
      db,
      eventPublisher,
      id,
      releaseProfileIds,
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
