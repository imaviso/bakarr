import { Context, Effect, Layer } from "effect";

import type { VideoFile } from "@packages/shared/index.ts";
import { Database, DatabaseError } from "@/db/database.ts";
import { FileSystem } from "@/lib/filesystem.ts";
import { MediaProbe } from "@/lib/media-probe.ts";
import { type AnimeServiceError } from "@/features/anime/errors.ts";
import type { EpisodeFileResolution } from "@/features/anime/file-mapping-support.ts";
import {
  listAnimeFilesEffect,
  resolveEpisodeFileEffect,
} from "@/features/anime/file-mapping-support.ts";

export interface AnimeFileReadServiceShape {
  readonly listFiles: (
    animeId: number,
  ) => Effect.Effect<VideoFile[], AnimeServiceError | DatabaseError>;
  readonly resolveEpisodeFile: (
    animeId: number,
    episodeNumber: number,
  ) => Effect.Effect<EpisodeFileResolution, AnimeServiceError | DatabaseError>;
}

export class AnimeFileReadService extends Context.Tag("@bakarr/api/AnimeFileReadService")<
  AnimeFileReadService,
  AnimeFileReadServiceShape
>() {}

const makeAnimeFileReadService = Effect.gen(function* () {
  const { db } = yield* Database;
  const fs = yield* FileSystem;
  const mediaProbe = yield* MediaProbe;

  const listFiles = Effect.fn("AnimeFileReadService.listFiles")(function* (animeId: number) {
    return yield* listAnimeFilesEffect({
      animeId,
      db,
      fs,
      mediaProbe,
    });
  });

  const resolveEpisodeFile = Effect.fn("AnimeFileReadService.resolveEpisodeFile")(function* (
    animeId: number,
    episodeNumber: number,
  ) {
    return yield* resolveEpisodeFileEffect({ animeId, db, episodeNumber, fs });
  });

  return {
    listFiles,
    resolveEpisodeFile,
  } satisfies AnimeFileReadServiceShape;
});

export const AnimeFileReadServiceLive = Layer.effect(
  AnimeFileReadService,
  makeAnimeFileReadService,
);
