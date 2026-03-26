import { Effect } from "effect";

import type { AppDatabase } from "../../db/database.ts";
import type { FileSystemShape } from "../../lib/filesystem.ts";
import type { MediaProbeShape } from "../../lib/media-probe.ts";
import {
  bulkMapEpisodeFilesEffect,
  deleteEpisodeFileEffect,
  listAnimeFilesEffect,
  mapEpisodeFileEffect,
  resolveEpisodeFileEffect,
} from "./file-mapping-support.ts";

export const makeAnimeFileOperations = (input: {
  db: AppDatabase;
  fs: FileSystemShape;
  mediaProbe: MediaProbeShape;
}) => {
  const deleteEpisodeFile = Effect.fn("AnimeService.deleteEpisodeFile")(function* (
    animeId: number,
    episodeNumber: number,
  ) {
    return yield* deleteEpisodeFileEffect({ animeId, db: input.db, episodeNumber, fs: input.fs });
  });

  const mapEpisode = Effect.fn("AnimeService.mapEpisode")(function* (
    animeId: number,
    episodeNumber: number,
    filePath: string,
  ) {
    return yield* mapEpisodeFileEffect({
      animeId,
      db: input.db,
      episodeNumber,
      filePath,
      fs: input.fs,
    });
  });

  const bulkMapEpisodes = Effect.fn("AnimeService.bulkMapEpisodes")(function* (
    animeId: number,
    mappings: readonly { episode_number: number; file_path: string }[],
  ) {
    return yield* bulkMapEpisodeFilesEffect({ animeId, db: input.db, fs: input.fs, mappings });
  });

  const listFiles = Effect.fn("AnimeService.listFiles")(function* (animeId: number) {
    return yield* listAnimeFilesEffect({
      animeId,
      db: input.db,
      fs: input.fs,
      mediaProbe: input.mediaProbe,
    });
  });

  const resolveEpisodeFile = Effect.fn("AnimeService.resolveEpisodeFile")(function* (
    animeId: number,
    episodeNumber: number,
  ) {
    return yield* resolveEpisodeFileEffect({ animeId, db: input.db, episodeNumber, fs: input.fs });
  });

  return {
    bulkMapEpisodes,
    deleteEpisodeFile,
    listFiles,
    mapEpisode,
    resolveEpisodeFile,
  };
};
