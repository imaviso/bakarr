import { Context, Effect, Layer } from "effect";

import type { VideoFile } from "@packages/shared/index.ts";
import { Database, type DatabaseError } from "@/db/database.ts";
import { EventBus } from "@/features/events/event-bus.ts";
import { ClockService, nowIsoFromClock } from "@/lib/clock.ts";
import { FileSystem } from "@/lib/filesystem.ts";
import { MediaProbe } from "@/lib/media-probe.ts";
import { listAnimeFilesEffect } from "@/features/anime/anime-file-list.ts";
import { scanAnimeFolderOrchestrationEffect } from "@/features/anime/anime-folder-scan-orchestration.ts";
import {
  bulkMapEpisodeFilesEffect,
  deleteEpisodeFileEffect,
  mapEpisodeFileEffect,
} from "@/features/anime/anime-file-write.ts";
import type {
  AnimeNotFoundError,
  AnimePathError,
  AnimeStoredDataError,
} from "@/features/anime/errors.ts";

export interface AnimeFileServiceShape {
  readonly bulkMapEpisodeFiles: (
    animeId: number,
    mappings: readonly { episode_number: number; file_path: string }[],
  ) => Effect.Effect<void, DatabaseError | AnimeNotFoundError | AnimePathError>;
  readonly deleteEpisodeFile: (
    animeId: number,
    episodeNumber: number,
  ) => Effect.Effect<void, DatabaseError | AnimeNotFoundError | AnimePathError>;
  readonly listFiles: (
    animeId: number,
  ) => Effect.Effect<readonly VideoFile[], DatabaseError | AnimeNotFoundError | AnimePathError>;
  readonly mapEpisodeFile: (
    animeId: number,
    episodeNumber: number,
    filePath: string,
  ) => Effect.Effect<
    void,
    DatabaseError | AnimeNotFoundError | AnimePathError | AnimeStoredDataError
  >;
  readonly scanFolder: (
    animeId: number,
  ) => Effect.Effect<
    { readonly found: number; readonly total: number },
    DatabaseError | AnimeNotFoundError | AnimePathError | AnimeStoredDataError
  >;
}

export class AnimeFileService extends Context.Tag("@bakarr/api/AnimeFileService")<
  AnimeFileService,
  AnimeFileServiceShape
>() {}

const makeAnimeFileService = Effect.gen(function* () {
  const { db } = yield* Database;
  const eventBus = yield* EventBus;
  const fs = yield* FileSystem;
  const mediaProbe = yield* MediaProbe;
  const clock = yield* ClockService;
  const nowIso = () => nowIsoFromClock(clock);

  const listFiles = Effect.fn("AnimeFileService.listFiles")(function* (animeId: number) {
    return yield* listAnimeFilesEffect({ animeId, db, fs, mediaProbe });
  });

  const scanFolder = Effect.fn("AnimeFileService.scanFolder")(function* (animeId: number) {
    return yield* scanAnimeFolderOrchestrationEffect({
      animeId,
      db,
      eventPublisher: eventBus,
      fs,
      mediaProbe,
      nowIso,
    });
  });

  const deleteEpisodeFile = Effect.fn("AnimeFileService.deleteEpisodeFile")(function* (
    animeId: number,
    episodeNumber: number,
  ) {
    yield* deleteEpisodeFileEffect({ animeId, db, episodeNumber, fs });
    yield* eventBus.publishInfo(
      `Deleted mapped file for anime ${animeId} episode ${episodeNumber}`,
    );
  });

  const mapEpisodeFile = Effect.fn("AnimeFileService.mapEpisodeFile")(function* (
    animeId: number,
    episodeNumber: number,
    filePath: string,
  ) {
    yield* mapEpisodeFileEffect({ animeId, db, episodeNumber, filePath, fs });
    yield* eventBus.publishInfo(`Mapped file for anime ${animeId} episode ${episodeNumber}`);
  });

  const bulkMapEpisodeFiles = Effect.fn("AnimeFileService.bulkMapEpisodeFiles")(function* (
    animeId: number,
    mappings: readonly { episode_number: number; file_path: string }[],
  ) {
    yield* bulkMapEpisodeFilesEffect({ animeId, db, fs, mappings });
    yield* eventBus.publishInfo(
      `Updated ${mappings.length} episode mapping(s) for anime ${animeId}`,
    );
  });

  return AnimeFileService.of({
    bulkMapEpisodeFiles,
    deleteEpisodeFile,
    listFiles,
    mapEpisodeFile,
    scanFolder,
  });
});

export const AnimeFileServiceLive = Layer.effect(AnimeFileService, makeAnimeFileService);
