import { eq, and } from "drizzle-orm";
import { Effect } from "effect";

import type { AppDatabase } from "@/db/database.ts";
import { mediaUnits } from "@/db/schema.ts";
import type { FileSystemShape } from "@/infra/filesystem/filesystem.ts";
import { isWithinPathRoot } from "@/infra/filesystem/filesystem.ts";
import { MediaPathError } from "@/features/media/errors.ts";
import { getAnimeRowEffect } from "@/features/media/shared/media-read-repository.ts";
import {
  clearEpisodeMappingEffect,
  bulkMapEpisodeFilesAtomicEffect,
  upsertEpisodeEffect,
} from "@/features/media/units/media-unit-repository.ts";
import {
  loadAnimeRoot,
  validateEpisodeFilePath,
} from "@/features/media/files/media-file-path-policy.ts";
import { tryDatabasePromise } from "@/infra/effect/db.ts";

export const deleteEpisodeFileEffect = Effect.fn("AnimeFileWrite.deleteEpisodeFileEffect")(
  function* (input: { mediaId: number; db: AppDatabase; unitNumber: number; fs: FileSystemShape }) {
    const animeRow = yield* getAnimeRowEffect(input.db, input.mediaId);
    const episodeRows = yield* tryDatabasePromise("Failed to find episode", () =>
      input.db
        .select({
          filePath: mediaUnits.filePath,
        })
        .from(mediaUnits)
        .where(and(eq(mediaUnits.mediaId, input.mediaId), eq(mediaUnits.number, input.unitNumber)))
        .limit(1),
    );

    const filePath = episodeRows[0]?.filePath;

    if (filePath) {
      const resolvedPath = yield* input.fs.realPath(filePath).pipe(
        Effect.mapError(
          (cause) =>
            new MediaPathError({
              cause,
              message: "MediaUnit file path does not exist or is inaccessible",
            }),
        ),
      );
      const animeRoot = yield* loadAnimeRoot(input.fs, animeRow.rootFolder);

      if (!isWithinPathRoot(resolvedPath, animeRoot)) {
        return yield* new MediaPathError({
          message: "File path is not within the media root folder",
        });
      }

      yield* input.fs.remove(filePath).pipe(
        Effect.mapError(
          (cause) =>
            new MediaPathError({
              cause,
              message: "Failed to delete episode file from disk",
            }),
        ),
      );
    }

    yield* clearEpisodeMappingEffect(input.db, input.mediaId, input.unitNumber);
    return undefined;
  },
);

export const mapEpisodeFileEffect = Effect.fn("AnimeFileWrite.mapEpisodeFileEffect")(
  function* (input: {
    mediaId: number;
    db: AppDatabase;
    unitNumber: number;
    filePath: string;
    fs: FileSystemShape;
  }) {
    const animeRow = yield* getAnimeRowEffect(input.db, input.mediaId);

    if (input.filePath.trim().length === 0) {
      yield* clearEpisodeMappingEffect(input.db, input.mediaId, input.unitNumber);
      return;
    }

    const animeRoot = yield* loadAnimeRoot(input.fs, animeRow.rootFolder);
    yield* validateEpisodeFilePath({
      animeRoot,
      filePath: input.filePath,
      fs: input.fs,
      outOfRootMessage: "File path is not within the media root folder",
    });

    yield* upsertEpisodeEffect(input.db, input.mediaId, input.unitNumber, {
      downloaded: true,
      filePath: input.filePath,
    });
  },
);

export const bulkMapEpisodeFilesEffect = Effect.fn("AnimeFileWrite.bulkMapEpisodeFilesEffect")(
  function* (input: {
    mediaId: number;
    db: AppDatabase;
    fs: FileSystemShape;
    mappings: readonly { unit_number: number; file_path: string }[];
  }) {
    const animeRow = yield* getAnimeRowEffect(input.db, input.mediaId);
    const animeRoot = yield* loadAnimeRoot(input.fs, animeRow.rootFolder);

    const validated: {
      unit_number: number;
      file_path: string;
      clear: boolean;
    }[] = [];

    for (const mapping of input.mappings) {
      if (mapping.file_path.trim().length === 0) {
        validated.push({
          unit_number: mapping.unit_number,
          file_path: "",
          clear: true,
        });
        continue;
      }

      yield* validateEpisodeFilePath({
        animeRoot,
        filePath: mapping.file_path,
        fs: input.fs,
        outOfRootMessage: `File path for episode ${mapping.unit_number} is not within the media root folder`,
      });

      validated.push({
        unit_number: mapping.unit_number,
        file_path: mapping.file_path,
        clear: false,
      });
    }

    yield* bulkMapEpisodeFilesAtomicEffect(input.db, input.mediaId, validated);
  },
);
