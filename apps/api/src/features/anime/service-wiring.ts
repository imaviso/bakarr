import type { AppDatabase } from "../../db/database.ts";
import type { FileSystemShape } from "../../lib/filesystem.ts";
import {
  bulkMapEpisodeFilesEffect,
  deleteEpisodeFileEffect,
  listAnimeFilesEffect,
  mapEpisodeFileEffect,
  resolveEpisodeFileEffect,
} from "./file-mapping-support.ts";
import type { AnimeServiceShape } from "./service.ts";

export const makeAnimeFileOperations = (input: {
  db: AppDatabase;
  fs: FileSystemShape;
}) => {
  const deleteEpisodeFile: AnimeServiceShape["deleteEpisodeFile"] = (
    animeId,
    episodeNumber,
  ) =>
    deleteEpisodeFileEffect({
      animeId,
      db: input.db,
      episodeNumber,
      fs: input.fs,
    });

  const mapEpisode: AnimeServiceShape["mapEpisode"] = (
    animeId,
    episodeNumber,
    filePath,
  ) =>
    mapEpisodeFileEffect({
      animeId,
      db: input.db,
      episodeNumber,
      filePath,
      fs: input.fs,
    });

  const bulkMapEpisodes: AnimeServiceShape["bulkMapEpisodes"] = (
    animeId,
    mappings,
  ) =>
    bulkMapEpisodeFilesEffect({
      animeId,
      db: input.db,
      fs: input.fs,
      mappings,
    });

  const listFiles: AnimeServiceShape["listFiles"] = (animeId) =>
    listAnimeFilesEffect({ animeId, db: input.db, fs: input.fs });

  const resolveEpisodeFile: AnimeServiceShape["resolveEpisodeFile"] = (
    animeId,
    episodeNumber,
  ) =>
    resolveEpisodeFileEffect({
      animeId,
      db: input.db,
      episodeNumber,
      fs: input.fs,
    });

  return {
    bulkMapEpisodes,
    deleteEpisodeFile,
    listFiles,
    mapEpisode,
    resolveEpisodeFile,
  };
};
