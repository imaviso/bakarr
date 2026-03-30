import { Context, Effect, Layer } from "effect";

import type { VideoFile } from "@packages/shared/index.ts";
import { Database, DatabaseError } from "@/db/database.ts";
import { ClockService, nowIsoFromClock } from "@/lib/clock.ts";
import { FileSystem } from "@/lib/filesystem.ts";
import { MediaProbe } from "@/lib/media-probe.ts";
import { EventPublisher } from "@/features/events/publisher.ts";
import { scanAnimeFolderOrchestrationEffect } from "@/features/anime/orchestration-support.ts";
import { type AnimeServiceError } from "@/features/anime/errors.ts";
import type { EpisodeFileResolution } from "@/features/anime/file-mapping-support.ts";
import {
  bulkMapEpisodeFilesEffect,
  deleteEpisodeFileEffect,
  listAnimeFilesEffect,
  mapEpisodeFileEffect,
  resolveEpisodeFileEffect,
} from "@/features/anime/file-mapping-support.ts";

export interface AnimeFileServiceShape {
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
  readonly resolveEpisodeFile: (
    animeId: number,
    episodeNumber: number,
  ) => Effect.Effect<EpisodeFileResolution, AnimeServiceError | DatabaseError>;
}

export class AnimeFileService extends Context.Tag("@bakarr/api/AnimeFileService")<
  AnimeFileService,
  AnimeFileServiceShape
>() {}

export const AnimeFileServiceLive = Layer.effect(
  AnimeFileService,
  Effect.gen(function* () {
    const { db } = yield* Database;
    const eventPublisher = yield* EventPublisher;
    const clock = yield* ClockService;
    const fs = yield* FileSystem;
    const mediaProbe = yield* MediaProbe;

    const deleteEpisodeFile = Effect.fn("AnimeService.deleteEpisodeFile")(function* (
      animeId: number,
      episodeNumber: number,
    ) {
      return yield* deleteEpisodeFileEffect({ animeId, db, episodeNumber, fs });
    });

    const mapEpisode = Effect.fn("AnimeService.mapEpisode")(function* (
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

    const bulkMapEpisodes = Effect.fn("AnimeService.bulkMapEpisodes")(function* (
      animeId: number,
      mappings: readonly { episode_number: number; file_path: string }[],
    ) {
      return yield* bulkMapEpisodeFilesEffect({ animeId, db, fs, mappings });
    });

    const listFiles = Effect.fn("AnimeService.listFiles")(function* (animeId: number) {
      return yield* listAnimeFilesEffect({
        animeId,
        db,
        fs,
        mediaProbe,
      });
    });

    const resolveEpisodeFile = Effect.fn("AnimeService.resolveEpisodeFile")(function* (
      animeId: number,
      episodeNumber: number,
    ) {
      return yield* resolveEpisodeFileEffect({ animeId, db, episodeNumber, fs });
    });

    return {
      bulkMapEpisodes,
      deleteEpisodeFile,
      scanFolder: Effect.fn("AnimeFileService.scanFolder")(function* (animeId: number) {
        return yield* scanAnimeFolderOrchestrationEffect({
          animeId,
          db,
          eventPublisher,
          fs,
          mediaProbe,
          nowIso: () => nowIsoFromClock(clock),
        });
      }),
      listFiles,
      mapEpisode,
      resolveEpisodeFile,
    } satisfies AnimeFileServiceShape;
  }),
);
