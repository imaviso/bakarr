import { eq, and } from "drizzle-orm";
import { Effect } from "effect";

import type { AppDatabase } from "@/db/database.ts";
import { episodes } from "@/db/schema.ts";
import type { FileSystemShape } from "@/lib/filesystem.ts";
import { isWithinPathRoot } from "@/lib/filesystem.ts";
import { AnimePathError } from "@/features/anime/errors.ts";
import { getAnimeRowEffect } from "@/features/anime/anime-read-repository.ts";
import {
  clearEpisodeMappingEffect,
  bulkMapEpisodeFilesAtomicEffect,
  upsertEpisodeEffect,
} from "@/features/anime/anime-episode-repository.ts";
import { loadAnimeRoot, validateEpisodeFilePath } from "@/features/anime/anime-file-path-policy.ts";
import { tryDatabasePromise } from "@/lib/effect-db.ts";

export const deleteEpisodeFileEffect = Effect.fn("AnimeFileWrite.deleteEpisodeFileEffect")(
  function* (input: {
    animeId: number;
    db: AppDatabase;
    episodeNumber: number;
    fs: FileSystemShape;
  }) {
    const animeRow = yield* getAnimeRowEffect(input.db, input.animeId);
    const episodeRows = yield* tryDatabasePromise("Failed to find episode", () =>
      input.db
        .select({
          filePath: episodes.filePath,
        })
        .from(episodes)
        .where(and(eq(episodes.animeId, input.animeId), eq(episodes.number, input.episodeNumber)))
        .limit(1),
    );

    const filePath = episodeRows[0]?.filePath;

    if (filePath) {
      const resolvedPath = yield* input.fs.realPath(filePath).pipe(
        Effect.mapError(
          () =>
            new AnimePathError({
              message: "Episode file path does not exist or is inaccessible",
            }),
        ),
      );
      const animeRoot = yield* loadAnimeRoot(input.fs, animeRow.rootFolder);

      if (!isWithinPathRoot(resolvedPath, animeRoot)) {
        return yield* new AnimePathError({
          message: "File path is not within the anime root folder",
        });
      }

      yield* input.fs.remove(filePath).pipe(
        Effect.mapError(
          () =>
            new AnimePathError({
              message: "Failed to delete episode file from disk",
            }),
        ),
      );
    }

    yield* clearEpisodeMappingEffect(input.db, input.animeId, input.episodeNumber);
  },
);

export const mapEpisodeFileEffect = Effect.fn("AnimeFileWrite.mapEpisodeFileEffect")(
  function* (input: {
    animeId: number;
    db: AppDatabase;
    episodeNumber: number;
    filePath: string;
    fs: FileSystemShape;
  }) {
    const animeRow = yield* getAnimeRowEffect(input.db, input.animeId);

    if (input.filePath.trim().length === 0) {
      yield* clearEpisodeMappingEffect(input.db, input.animeId, input.episodeNumber);
      return;
    }

    const animeRoot = yield* loadAnimeRoot(input.fs, animeRow.rootFolder);
    yield* validateEpisodeFilePath({
      animeRoot,
      filePath: input.filePath,
      fs: input.fs,
      outOfRootMessage: "File path is not within the anime root folder",
    });

    yield* upsertEpisodeEffect(input.db, input.animeId, input.episodeNumber, {
      downloaded: true,
      filePath: input.filePath,
    });
  },
);

export const bulkMapEpisodeFilesEffect = Effect.fn("AnimeFileWrite.bulkMapEpisodeFilesEffect")(
  function* (input: {
    animeId: number;
    db: AppDatabase;
    fs: FileSystemShape;
    mappings: readonly { episode_number: number; file_path: string }[];
  }) {
    const animeRow = yield* getAnimeRowEffect(input.db, input.animeId);
    const animeRoot = yield* loadAnimeRoot(input.fs, animeRow.rootFolder);

    const validated: {
      episode_number: number;
      file_path: string;
      clear: boolean;
    }[] = [];

    for (const mapping of input.mappings) {
      if (mapping.file_path.trim().length === 0) {
        validated.push({
          episode_number: mapping.episode_number,
          file_path: "",
          clear: true,
        });
        continue;
      }

      yield* validateEpisodeFilePath({
        animeRoot,
        filePath: mapping.file_path,
        fs: input.fs,
        outOfRootMessage: `File path for episode ${mapping.episode_number} is not within the anime root folder`,
      });

      validated.push({
        episode_number: mapping.episode_number,
        file_path: mapping.file_path,
        clear: false,
      });
    }

    yield* bulkMapEpisodeFilesAtomicEffect(input.db, input.animeId, validated);
  },
);
