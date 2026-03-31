import { Context, Effect, Layer } from "effect";

import { Database, DatabaseError } from "@/db/database.ts";
import { ClockService, nowIsoFromClock } from "@/lib/clock.ts";
import { FileSystem } from "@/lib/filesystem.ts";
import { MediaProbe } from "@/lib/media-probe.ts";
import { EventPublisher } from "@/features/events/publisher.ts";
import { scanAnimeFolderOrchestrationEffect } from "@/features/anime/anime-folder-scan-orchestration.ts";
import { type AnimeServiceError } from "@/features/anime/errors.ts";
import {
  bulkMapEpisodeFilesEffect,
  deleteEpisodeFileEffect,
  mapEpisodeFileEffect,
} from "@/features/anime/file-mapping-support.ts";

export interface AnimeFileMutationServiceShape {
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
}

export class AnimeFileMutationService extends Context.Tag("@bakarr/api/AnimeFileMutationService")<
  AnimeFileMutationService,
  AnimeFileMutationServiceShape
>() {}

const makeAnimeFileMutationService = Effect.gen(function* () {
  const { db } = yield* Database;
  const eventPublisher = yield* EventPublisher;
  const clock = yield* ClockService;
  const fs = yield* FileSystem;
  const mediaProbe = yield* MediaProbe;

  const deleteEpisodeFile = Effect.fn("AnimeFileMutationService.deleteEpisodeFile")(function* (
    animeId: number,
    episodeNumber: number,
  ) {
    return yield* deleteEpisodeFileEffect({ animeId, db, episodeNumber, fs });
  });

  const mapEpisode = Effect.fn("AnimeFileMutationService.mapEpisode")(function* (
    animeId: number,
    episodeNumber: number,
    filePath: string,
  ) {
    return yield* mapEpisodeFileEffect({
      animeId,
      db,
      episodeNumber,
      filePath,
      fs,
    });
  });

  const bulkMapEpisodes = Effect.fn("AnimeFileMutationService.bulkMapEpisodes")(function* (
    animeId: number,
    mappings: readonly { episode_number: number; file_path: string }[],
  ) {
    return yield* bulkMapEpisodeFilesEffect({ animeId, db, fs, mappings });
  });

  const scanFolder = Effect.fn("AnimeFileMutationService.scanFolder")(function* (animeId: number) {
    return yield* scanAnimeFolderOrchestrationEffect({
      animeId,
      db,
      eventPublisher,
      fs,
      mediaProbe,
      nowIso: () => nowIsoFromClock(clock),
    });
  });

  return {
    bulkMapEpisodes,
    deleteEpisodeFile,
    mapEpisode,
    scanFolder,
  } satisfies AnimeFileMutationServiceShape;
});

export const AnimeFileMutationServiceLive = Layer.effect(
  AnimeFileMutationService,
  makeAnimeFileMutationService,
);
