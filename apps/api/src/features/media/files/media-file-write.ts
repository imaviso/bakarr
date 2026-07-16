import { Effect } from "effect";

import type { FileSystemShape } from "@/infra/filesystem/filesystem.ts";
import { isWithinPathRoot } from "@/infra/filesystem/filesystem.ts";
import { DomainPathError } from "@/features/errors.ts";
import type { MediaRepositoryShape } from "@/features/media/shared/media-repository.ts";
import type { MediaUnitRepositoryShape } from "@/features/media/units/media-unit-repository.ts";
import {
  loadMediaRoot,
  validateEpisodeFilePath,
} from "@/features/media/files/media-file-path-policy.ts";

export const deleteEpisodeFileEffect = Effect.fn("MediaFileWrite.deleteEpisodeFileEffect")(
  function* (input: {
    mediaId: number;
    mediaReadRepository: MediaRepositoryShape;
    mediaUnitRepository: MediaUnitRepositoryShape;
    unitNumber: number;
    fs: FileSystemShape;
  }) {
    const animeRow = yield* input.mediaReadRepository.getMediaRow(input.mediaId);
    const episodeState = yield* input.mediaReadRepository.loadCurrentEpisodeState(
      input.mediaId,
      input.unitNumber,
    );
    const filePath = episodeState._tag === "Some" ? episodeState.value.filePath : undefined;

    if (filePath) {
      const resolvedPath = yield* input.fs.realPath(filePath).pipe(
        Effect.mapError(
          (cause) =>
            new DomainPathError({
              cause,
              message: "MediaUnit file path does not exist or is inaccessible",
            }),
        ),
      );
      const animeRoot = yield* loadMediaRoot(input.fs, animeRow.rootFolder);

      if (!isWithinPathRoot(resolvedPath, animeRoot)) {
        return yield* new DomainPathError({
          message: "File path is not within the media root folder",
        });
      }

      yield* input.fs.remove(filePath).pipe(
        Effect.mapError(
          (cause) =>
            new DomainPathError({
              cause,
              message: "Failed to delete episode file from disk",
            }),
        ),
      );
    }

    yield* input.mediaUnitRepository.clearEpisodeMapping(input.mediaId, input.unitNumber);
    return undefined;
  },
);

export const mapEpisodeFileEffect = Effect.fn("MediaFileWrite.mapEpisodeFileEffect")(
  function* (input: {
    mediaId: number;
    unitNumber: number;
    filePath: string;
    fs: FileSystemShape;
    mediaReadRepository: MediaRepositoryShape;
    mediaUnitRepository: MediaUnitRepositoryShape;
  }) {
    const animeRow = yield* input.mediaReadRepository.getMediaRow(input.mediaId);

    if (input.filePath.trim().length === 0) {
      yield* input.mediaUnitRepository.clearEpisodeMapping(input.mediaId, input.unitNumber);
      return;
    }

    const animeRoot = yield* loadMediaRoot(input.fs, animeRow.rootFolder);
    yield* validateEpisodeFilePath({
      animeRoot,
      filePath: input.filePath,
      fs: input.fs,
      outOfRootMessage: "File path is not within the media root folder",
    });

    yield* input.mediaUnitRepository.upsertEpisode(input.mediaId, input.unitNumber, {
      downloaded: true,
      filePath: input.filePath,
    });
  },
);

export const bulkMapEpisodeFilesEffect = Effect.fn("MediaFileWrite.bulkMapEpisodeFilesEffect")(
  function* (input: {
    mediaId: number;
    fs: FileSystemShape;
    mediaReadRepository: MediaRepositoryShape;
    mediaUnitRepository: MediaUnitRepositoryShape;
    mappings: readonly { unit_number: number; file_path: string }[];
  }) {
    const animeRow = yield* input.mediaReadRepository.getMediaRow(input.mediaId);
    const animeRoot = yield* loadMediaRoot(input.fs, animeRow.rootFolder);

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

    yield* input.mediaUnitRepository.bulkMapEpisodeFiles(input.mediaId, validated);
  },
);
