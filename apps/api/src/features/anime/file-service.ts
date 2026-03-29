import { Context, Effect, Layer } from "effect";

import type { VideoFile } from "@packages/shared/index.ts";
import { Database, DatabaseError } from "@/db/database.ts";
import { ClockService, nowIsoFromClock } from "@/lib/clock.ts";
import { FileSystem } from "@/lib/filesystem.ts";
import { MediaProbe } from "@/lib/media-probe.ts";
import { EventPublisher } from "@/features/events/publisher.ts";
import { makeAnimeFileOperations } from "@/features/anime/service-wiring.ts";
import { scanAnimeFolderOrchestrationEffect } from "@/features/anime/orchestration-support.ts";
import { type AnimeServiceError } from "@/features/anime/errors.ts";
import type { EpisodeFileResolution } from "@/features/anime/file-mapping-support.ts";

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
    const fileOperations = yield* makeAnimeFileOperations();

    return {
      ...fileOperations,
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
    } satisfies AnimeFileServiceShape;
  }),
);
