import { Effect } from "effect";

import type { AppDatabase } from "@/db/database.ts";
import type { FileSystemShape } from "@/infra/filesystem/filesystem.ts";
import { isWithinPathRoot } from "@/infra/filesystem/filesystem.ts";
import {
  getAnimeRowEffect,
  getEpisodeRowEffect,
} from "@/features/anime/shared/anime-read-repository.ts";
import {
  EpisodeFileResolved,
  EpisodeFileUnmapped,
  EpisodeFileRootInaccessible,
  EpisodeFileMissing,
  EpisodeFileOutsideRoot,
} from "@/features/anime/files/anime-file-resolution.ts";

export const resolveEpisodeFileEffect = Effect.fn("AnimeFileRead.resolveEpisodeFileEffect")(
  function* (input: {
    animeId: number;
    db: AppDatabase;
    episodeNumber: number;
    fs: FileSystemShape;
  }) {
    const animeRow = yield* getAnimeRowEffect(input.db, input.animeId);
    const episodeRow = yield* getEpisodeRowEffect(input.db, input.animeId, input.episodeNumber);

    if (!episodeRow.filePath) {
      return new EpisodeFileUnmapped();
    }

    const animeRootResult = yield* Effect.either(input.fs.realPath(animeRow.rootFolder));

    if (animeRootResult._tag === "Left") {
      yield* Effect.logDebug("Anime root folder not accessible").pipe(
        Effect.annotateLogs({
          animeId: input.animeId,
          episodeNumber: input.episodeNumber,
          rootFolder: animeRow.rootFolder,
        }),
      );
      return new EpisodeFileRootInaccessible({
        rootFolder: animeRow.rootFolder,
      });
    }

    const filePathResult = yield* Effect.either(input.fs.realPath(episodeRow.filePath));

    if (filePathResult._tag === "Left") {
      yield* Effect.logDebug("Episode file path not accessible").pipe(
        Effect.annotateLogs({
          animeId: input.animeId,
          episodeNumber: input.episodeNumber,
          filePath: episodeRow.filePath,
        }),
      );
      return new EpisodeFileMissing({
        filePath: episodeRow.filePath,
      });
    }

    const filePath = filePathResult.right;

    if (!isWithinPathRoot(filePath, animeRootResult.right)) {
      yield* Effect.logDebug("Episode file outside anime root").pipe(
        Effect.annotateLogs({
          animeId: input.animeId,
          episodeNumber: input.episodeNumber,
          filePath,
          animeRoot: animeRootResult.right,
        }),
      );
      return new EpisodeFileOutsideRoot({
        animeRoot: animeRootResult.right,
        filePath,
      });
    }

    return new EpisodeFileResolved({
      fileName: filePath.split("/").pop() ?? `episode-${input.episodeNumber}`,
      filePath,
    });
  },
);
