import { Effect } from "effect";

import type { FileSystemShape } from "@/infra/filesystem/filesystem.ts";
import type { MediaProbeShape } from "@/infra/media/probe.ts";
import type { VideoFile } from "@packages/shared/index.ts";
import {
  mergeProbedMediaMetadata,
  probeMediaMetadataOrUndefined,
  type ProbedMediaMetadata,
  shouldProbeDetailedMediaMetadata,
} from "@/infra/media/probe.ts";
import {
  parseFileSourceIdentity,
  toSharedParsedEpisodeIdentity,
} from "@/infra/media/identity/identity.ts";
import {
  collectVideoFiles,
  collectVolumeFiles,
  extractUnitNumbersFromFile,
} from "@/features/media/files/files.ts";
import { buildScannedFileMetadata } from "@/infra/scanned-file-metadata.ts";
import type { MediaReadRepositoryShape } from "@/features/media/shared/media-read-repository.ts";
import type { MediaUnitRepositoryShape } from "@/features/media/units/media-unit-repository.ts";
import { DomainPathError } from "@/features/errors.ts";

interface EpisodeMediaCacheRow {
  readonly audioChannels: string | null;
  readonly audioCodec: string | null;
  readonly durationSeconds: number | null;
  readonly filePath: string | null;
  readonly id: number;
  readonly resolution: string | null;
  readonly videoCodec: string | null;
}

function mergeEpisodeCachedMetadata(
  rows: ReadonlyArray<EpisodeMediaCacheRow>,
): ProbedMediaMetadata | undefined {
  let audio_channels: string | undefined;
  let audio_codec: string | undefined;
  let duration_seconds: number | undefined;
  let resolution: string | undefined;
  let video_codec: string | undefined;

  for (const row of rows) {
    audio_channels = audio_channels ?? row.audioChannels ?? undefined;
    audio_codec = audio_codec ?? row.audioCodec ?? undefined;
    duration_seconds = duration_seconds ?? row.durationSeconds ?? undefined;
    resolution = resolution ?? row.resolution ?? undefined;
    video_codec = video_codec ?? row.videoCodec ?? undefined;
  }

  if (
    audio_channels === undefined &&
    audio_codec === undefined &&
    duration_seconds === undefined &&
    resolution === undefined &&
    video_codec === undefined
  ) {
    return undefined;
  }

  return {
    audio_channels,
    audio_codec,
    duration_seconds,
    resolution,
    video_codec,
  };
}

function toEpisodeProbeCachePatch(
  row: EpisodeMediaCacheRow,
  metadata: {
    readonly audio_channels?: string | undefined;
    readonly audio_codec?: string | undefined;
    readonly duration_seconds?: number | undefined;
    readonly resolution?: string | undefined;
    readonly video_codec?: string | undefined;
  },
) {
  return {
    audioChannels: row.audioChannels ?? metadata.audio_channels,
    audioCodec: row.audioCodec ?? metadata.audio_codec,
    durationSeconds: row.durationSeconds ?? metadata.duration_seconds,
    resolution: row.resolution ?? metadata.resolution,
    videoCodec: row.videoCodec ?? metadata.video_codec,
  };
}

interface EpisodeProbeCachePatch {
  readonly audioChannels?: string | undefined;
  readonly audioCodec?: string | undefined;
  readonly durationSeconds?: number | undefined;
  readonly resolution?: string | undefined;
  readonly videoCodec?: string | undefined;
}

function hasEpisodeProbeCachePatch(patch: EpisodeProbeCachePatch) {
  return (
    patch.audioChannels !== undefined ||
    patch.audioCodec !== undefined ||
    patch.durationSeconds !== undefined ||
    patch.resolution !== undefined ||
    patch.videoCodec !== undefined
  );
}

export const listMediaFilesEffect = Effect.fn("MediaFileList.listMediaFilesEffect")(
  function* (input: {
    mediaId: number;
    fs: FileSystemShape;
    mediaReadRepository: MediaReadRepositoryShape;
    mediaUnitRepository: MediaUnitRepositoryShape;
    mediaProbe: MediaProbeShape;
  }) {
    const animeRow = yield* input.mediaReadRepository.getMediaRow(input.mediaId);
    const collectFiles = animeRow.mediaKind === "anime" ? collectVideoFiles : collectVolumeFiles;
    const files = yield* collectFiles(input.fs, animeRow.rootFolder).pipe(
      Effect.mapError(
        (cause) =>
          new DomainPathError({
            cause,
            message: "Media root folder does not exist or is inaccessible",
          }),
      ),
    );

    const mappedRows = yield* input.mediaReadRepository.listMappedUnitRows(input.mediaId);
    const cachedEpisodeRows: EpisodeMediaCacheRow[] = mappedRows.map((row) => ({
      audioChannels: row.audioChannels,
      audioCodec: row.audioCodec,
      durationSeconds: row.durationSeconds,
      filePath: row.filePath,
      id: row.id,
      resolution: row.resolution,
      videoCodec: row.videoCodec,
    }));

    const cachedEpisodeRowsByPath = new Map<string, EpisodeMediaCacheRow[]>();

    for (const row of cachedEpisodeRows) {
      if (!row.filePath) {
        continue;
      }

      const current = cachedEpisodeRowsByPath.get(row.filePath) ?? [];
      current.push(row);
      cachedEpisodeRowsByPath.set(row.filePath, current);
    }

    const processMediaFile = Effect.fn("MediaFileList.processMediaFile")(function* (file: {
      readonly name: string;
      readonly path: string;
      readonly size: number;
    }) {
      const cachedRowsForFile = cachedEpisodeRowsByPath.get(file.path) ?? [];
      const parsed = parseFileSourceIdentity(file.path);
      const identity = parsed.source_identity;
      const sharedIdentity = toSharedParsedEpisodeIdentity(identity);
      const isVolumeMedia = animeRow.mediaKind !== "anime";
      const unitNumbers = extractUnitNumbersFromFile(file.name, file.path, isVolumeMedia);
      const unitNumber = unitNumbers.length > 0 ? unitNumbers[0] : undefined;

      const metadata = buildScannedFileMetadata({
        filePath: file.path,
        ...(parsed.group === undefined ? {} : { group: parsed.group }),
        ...(sharedIdentity === undefined ? {} : { sourceIdentity: sharedIdentity }),
      });

      const baseFile: VideoFile = {
        air_date: metadata.air_date,
        audio_channels: metadata.audio_channels,
        audio_codec: metadata.audio_codec,
        unit_number: unitNumber,
        unit_numbers: unitNumbers.length > 0 ? [...unitNumbers] : undefined,
        unit_title: metadata.unit_title,
        group: parsed.group ?? undefined,
        duration_seconds: metadata.duration_seconds,
        name: file.name,
        path: file.path,
        quality: metadata.quality,
        resolution: parsed.resolution ?? undefined,
        size: file.size,
        source_identity: sharedIdentity,
        video_codec: metadata.video_codec,
      };

      const mergedWithCachedMetadata = mergeProbedMediaMetadata(
        baseFile,
        mergeEpisodeCachedMetadata(cachedRowsForFile),
      );

      const probedMetadata = shouldProbeDetailedMediaMetadata(mergedWithCachedMetadata)
        ? yield* probeMediaMetadataOrUndefined(input.mediaProbe, file.path)
        : undefined;
      const mergedMetadata = mergeProbedMediaMetadata(mergedWithCachedMetadata, probedMetadata);

      if (probedMetadata && cachedRowsForFile.length > 0) {
        const cacheMetadataInput: {
          readonly audio_channels?: string;
          readonly audio_codec?: string;
          readonly duration_seconds?: number;
          readonly resolution?: string;
          readonly video_codec?: string;
        } = {
          ...(probedMetadata.audio_channels === undefined
            ? {}
            : { audio_channels: probedMetadata.audio_channels }),
          ...(probedMetadata.audio_codec === undefined
            ? {}
            : { audio_codec: probedMetadata.audio_codec }),
          ...(probedMetadata.duration_seconds === undefined
            ? {}
            : { duration_seconds: probedMetadata.duration_seconds }),
          ...(probedMetadata.resolution === undefined
            ? {}
            : { resolution: probedMetadata.resolution }),
          ...(probedMetadata.video_codec === undefined
            ? {}
            : { video_codec: probedMetadata.video_codec }),
        };

        for (const row of cachedRowsForFile) {
          const patch = toEpisodeProbeCachePatch(row, cacheMetadataInput);
          if (!hasEpisodeProbeCachePatch(patch)) {
            continue;
          }

          yield* input.mediaUnitRepository.patchUnitProbeMetadata(row.id, patch);
        }
      }

      return mergedMetadata;
    });

    return yield* Effect.forEach(files, processMediaFile, { concurrency: 4 });
  },
);
