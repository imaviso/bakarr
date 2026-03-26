import { Effect } from "effect";

import { Database } from "../../db/database.ts";
import { FileSystem } from "../../lib/filesystem.ts";
import { MediaProbe } from "../../lib/media-probe.ts";
import {
  bulkMapEpisodeFilesEffect,
  deleteEpisodeFileEffect,
  listAnimeFilesEffect,
  mapEpisodeFileEffect,
  resolveEpisodeFileEffect,
} from "./file-mapping-support.ts";

export const makeAnimeFileOperations = Effect.fn("AnimeService.makeAnimeFileOperations")(
  function* () {
    const { db } = yield* Database;
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
      listFiles,
      mapEpisode,
      resolveEpisodeFile,
    };
  },
);
