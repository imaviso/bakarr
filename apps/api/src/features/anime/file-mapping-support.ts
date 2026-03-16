import { and, eq } from "drizzle-orm";
import { Effect } from "effect";

import type { AppDatabase, DatabaseError } from "../../db/database.ts";
import { episodes } from "../../db/schema.ts";
import type { FileSystemShape } from "../../lib/filesystem.ts";
import { isWithinPathRoot } from "../../lib/filesystem.ts";
import type { VideoFile } from "../../../../../packages/shared/src/index.ts";
import {
  classifyMediaArtifact,
  parseFileSourceIdentity,
} from "../../lib/media-identity.ts";
import { collectVideoFiles } from "./files.ts";
import { AnimePathError, type AnimeServiceError } from "./errors.ts";
import {
  clearEpisodeMapping,
  getAnimeRowOrThrow,
  getEpisodeRowOrThrow,
  inferAiredAt,
  upsertEpisode,
} from "./repository.ts";
import { tryAnimePromise } from "./service-support.ts";

export const loadAnimeRoot = Effect.fn("AnimeService.loadAnimeRoot")(function* (
  fs: FileSystemShape,
  rootFolder: string,
) {
  return yield* fs.realPath(rootFolder).pipe(
    Effect.mapError(() =>
      new AnimePathError({
        message: "Anime root folder does not exist",
      })
    ),
  );
});

export const validateEpisodeFilePath = Effect.fn(
  "AnimeService.validateEpisodeFilePath",
)(function* (input: {
  animeRoot: string;
  filePath: string;
  fs: FileSystemShape;
  outOfRootMessage: string;
}) {
  const resolvedPath = yield* input.fs.realPath(input.filePath).pipe(
    Effect.mapError(() =>
      new AnimePathError({
        message: "File path does not exist or is inaccessible",
      })
    ),
  );

  if (!isWithinPathRoot(resolvedPath, input.animeRoot)) {
    return yield* new AnimePathError({
      message: input.outOfRootMessage,
    });
  }

  return resolvedPath;
});

export const loadAnimeFiles = Effect.fn("AnimeService.loadAnimeFiles")(
  function* (fs: FileSystemShape, rootFolder: string) {
    return yield* collectVideoFiles(fs, rootFolder).pipe(
      Effect.mapError(() =>
        new AnimePathError({
          message: "Anime root folder does not exist or is inaccessible",
        })
      ),
    );
  },
);

export const scanAnimeFolderEffect = Effect.fn(
  "AnimeService.scanAnimeFolderEffect",
)(function* (input: {
  animeId: number;
  db: AppDatabase;
  fs: FileSystemShape;
}) {
  const animeRow = yield* tryAnimePromise(
    "Failed to scan anime folder",
    () => getAnimeRowOrThrow(input.db, input.animeId),
  );
  const files = yield* loadAnimeFiles(input.fs, animeRow.rootFolder);
  let found = 0;

  for (const file of files) {
    const classification = classifyMediaArtifact(file.path, file.name);
    if (classification.kind === "extra" || classification.kind === "sample") {
      continue;
    }

    const parsed = parseFileSourceIdentity(file.path);
    const identity = parsed.source_identity;
    if (!identity || identity.scheme === "daily") {
      continue;
    }

    const episodeNumbers = identity.episode_numbers;
    if (episodeNumbers.length === 0) {
      continue;
    }

    for (const episodeNumber of episodeNumbers) {
      yield* tryAnimePromise(
        "Failed to scan anime folder",
        () =>
          upsertEpisode(input.db, input.animeId, episodeNumber, {
            aired: inferAiredAt(
              animeRow.status,
              episodeNumber,
              animeRow.episodeCount ?? undefined,
              animeRow.startDate ?? undefined,
              animeRow.endDate ?? undefined,
            ),
            downloaded: true,
            filePath: file.path,
            title: null,
          }),
      );
    }
    found += episodeNumbers.length;
  }

  return {
    animeRow,
    found,
    total: files.length,
  };
});

export const deleteEpisodeFileEffect = Effect.fn(
  "AnimeService.deleteEpisodeFileEffect",
)(function* (input: {
  animeId: number;
  db: AppDatabase;
  episodeNumber: number;
  fs: FileSystemShape;
}) {
  const animeRow = yield* tryAnimePromise(
    "Failed to delete episode file",
    () => getAnimeRowOrThrow(input.db, input.animeId),
  );
  const episodeRow = yield* tryAnimePromise(
    "Failed to delete episode file",
    () => getEpisodeRowOrThrow(input.db, input.animeId, input.episodeNumber),
  );

  if (episodeRow.filePath) {
    const filePath = episodeRow.filePath;
    const resolvedPathResult = yield* Effect.either(
      input.fs.realPath(filePath),
    );

    if (resolvedPathResult._tag === "Right") {
      const animeRoot = yield* loadAnimeRoot(input.fs, animeRow.rootFolder);

      if (!isWithinPathRoot(resolvedPathResult.right, animeRoot)) {
        return yield* new AnimePathError({
          message: "File path is not within the anime root folder",
        });
      }

      yield* input.fs.remove(filePath).pipe(
        Effect.mapError(() =>
          new AnimePathError({
            message: "Failed to delete episode file from disk",
          })
        ),
      );
    }
  }

  yield* tryAnimePromise(
    "Failed to delete episode file",
    () =>
      input.db.update(episodes).set({ downloaded: false, filePath: null })
        .where(
          and(
            eq(episodes.animeId, input.animeId),
            eq(episodes.number, input.episodeNumber),
          ),
        ),
  );
});

export const mapEpisodeFileEffect = Effect.fn(
  "AnimeService.mapEpisodeFileEffect",
)(function* (input: {
  animeId: number;
  db: AppDatabase;
  episodeNumber: number;
  filePath: string;
  fs: FileSystemShape;
}) {
  const animeRow = yield* tryAnimePromise(
    "Failed to map episode file",
    () => getAnimeRowOrThrow(input.db, input.animeId),
  );

  if (input.filePath.trim().length === 0) {
    yield* tryAnimePromise(
      "Failed to map episode file",
      () => clearEpisodeMapping(input.db, input.animeId, input.episodeNumber),
    );
    return;
  }

  const animeRoot = yield* loadAnimeRoot(input.fs, animeRow.rootFolder);
  yield* validateEpisodeFilePath({
    animeRoot,
    filePath: input.filePath,
    fs: input.fs,
    outOfRootMessage: "File path is not within the anime root folder",
  });

  yield* tryAnimePromise(
    "Failed to map episode file",
    () =>
      upsertEpisode(input.db, input.animeId, input.episodeNumber, {
        downloaded: true,
        filePath: input.filePath,
      }),
  );
});

export const bulkMapEpisodeFilesEffect = Effect.fn(
  "AnimeService.bulkMapEpisodeFilesEffect",
)(function* (input: {
  animeId: number;
  db: AppDatabase;
  fs: FileSystemShape;
  mappings: readonly { episode_number: number; file_path: string }[];
}) {
  const animeRow = yield* tryAnimePromise(
    "Failed to bulk-map episode files",
    () => getAnimeRowOrThrow(input.db, input.animeId),
  );
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
      outOfRootMessage:
        `File path for episode ${mapping.episode_number} is not within the anime root folder`,
    });

    validated.push({
      episode_number: mapping.episode_number,
      file_path: mapping.file_path,
      clear: false,
    });
  }

  for (const entry of validated) {
    if (entry.clear) {
      yield* tryAnimePromise(
        "Failed to bulk-map episode files",
        () =>
          clearEpisodeMapping(input.db, input.animeId, entry.episode_number),
      );
    } else {
      yield* tryAnimePromise(
        "Failed to bulk-map episode files",
        () =>
          upsertEpisode(input.db, input.animeId, entry.episode_number, {
            downloaded: true,
            filePath: entry.file_path,
          }),
      );
    }
  }
});

export const listAnimeFilesEffect = Effect.fn(
  "AnimeService.listAnimeFilesEffect",
)(
  function* (input: {
    animeId: number;
    db: AppDatabase;
    fs: FileSystemShape;
  }) {
    const animeRow = yield* tryAnimePromise(
      "Failed to list video files",
      () => getAnimeRowOrThrow(input.db, input.animeId),
    );
    const files = yield* loadAnimeFiles(input.fs, animeRow.rootFolder);

    return files.map((file): VideoFile => {
      const parsed = parseFileSourceIdentity(file.path);
      const identity = parsed.source_identity;
      const episodeNumber = identity && identity.scheme !== "daily"
        ? identity.episode_numbers[0]
        : undefined;

      return {
        episode_number: episodeNumber,
        name: file.name,
        path: file.path,
        size: file.size,
      };
    });
  },
);

export const resolveEpisodeFileEffect = Effect.fn(
  "AnimeService.resolveEpisodeFileEffect",
)(function* (input: {
  animeId: number;
  db: AppDatabase;
  episodeNumber: number;
  fs: FileSystemShape;
}) {
  const animeRow = yield* tryAnimePromise(
    "Failed to resolve episode file",
    () => getAnimeRowOrThrow(input.db, input.animeId),
  );
  const episodeRow = yield* tryAnimePromise(
    "Failed to resolve episode file",
    () => getEpisodeRowOrThrow(input.db, input.animeId, input.episodeNumber),
  );

  if (!episodeRow.filePath) {
    return null;
  }

  const animeRootResult = yield* Effect.either(
    input.fs.realPath(animeRow.rootFolder),
  );

  if (animeRootResult._tag === "Left") {
    return null;
  }

  const filePathResult = yield* Effect.either(
    input.fs.realPath(episodeRow.filePath),
  );

  if (filePathResult._tag === "Left") {
    return null;
  }

  const filePath = filePathResult.right;

  if (!isWithinPathRoot(filePath, animeRootResult.right)) {
    return null;
  }

  return {
    fileName: filePath.split("/").pop() ?? `episode-${input.episodeNumber}`,
    filePath,
  };
});

export type AnimeFileMappingError = AnimeServiceError | DatabaseError;
