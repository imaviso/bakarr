import { and, eq, isNotNull } from "drizzle-orm";
import { Effect } from "effect";

import type { AppDatabase } from "@/db/database.ts";
import { episodes } from "@/db/schema.ts";
import type { FileSystemShape } from "@/lib/filesystem.ts";
import type { MediaProbeShape } from "@/lib/media-probe.ts";
import type { VideoFile } from "@packages/shared/index.ts";
import {
  mergeProbedMediaMetadata,
  type ProbedMediaMetadata,
  shouldProbeDetailedMediaMetadata,
} from "@/lib/media-probe.ts";
import { parseFileSourceIdentity, toSharedParsedEpisodeIdentity } from "@/lib/media-identity.ts";
import { collectVideoFiles } from "@/features/anime/files.ts";
import { buildScannedFileMetadata } from "@/lib/scanned-file-metadata.ts";
import { getAnimeRowEffect } from "@/features/anime/anime-read-repository.ts";
import { tryDatabasePromise } from "@/lib/effect-db.ts";
import { AnimePathError } from "@/features/anime/errors.ts";

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

function hasEpisodeProbeCachePatch(patch: ReturnType<typeof toEpisodeProbeCachePatch>) {
  return (
    patch.audioChannels !== undefined ||
    patch.audioCodec !== undefined ||
    patch.durationSeconds !== undefined ||
    patch.resolution !== undefined ||
    patch.videoCodec !== undefined
  );
}

export const listAnimeFilesEffect = Effect.fn("AnimeFileList.listAnimeFilesEffect")(
  function* (input: {
    animeId: number;
    db: AppDatabase;
    fs: FileSystemShape;
    mediaProbe: MediaProbeShape;
  }) {
    const animeRow = yield* getAnimeRowEffect(input.db, input.animeId);
    const files = yield* collectVideoFiles(input.fs, animeRow.rootFolder).pipe(
      Effect.mapError(
        (cause) =>
          new AnimePathError({
            cause,
            message: "Anime root folder does not exist or is inaccessible",
          }),
      ),
    );

    const cachedEpisodeRows = yield* tryDatabasePromise("Failed to list video files", () =>
      input.db
        .select({
          audioChannels: episodes.audioChannels,
          audioCodec: episodes.audioCodec,
          durationSeconds: episodes.durationSeconds,
          filePath: episodes.filePath,
          id: episodes.id,
          resolution: episodes.resolution,
          videoCodec: episodes.videoCodec,
        })
        .from(episodes)
        .where(and(eq(episodes.animeId, input.animeId), isNotNull(episodes.filePath))),
    );

    const cachedEpisodeRowsByPath = new Map<string, EpisodeMediaCacheRow[]>();

    for (const row of cachedEpisodeRows) {
      if (!row.filePath) {
        continue;
      }

      const current = cachedEpisodeRowsByPath.get(row.filePath) ?? [];
      current.push(row);
      cachedEpisodeRowsByPath.set(row.filePath, current);
    }

    const processAnimeFile = Effect.fn("AnimeFileList.processAnimeFile")(function* (file: {
      readonly name: string;
      readonly path: string;
      readonly size: number;
    }) {
      const cachedRowsForFile = cachedEpisodeRowsByPath.get(file.path) ?? [];
      const parsed = parseFileSourceIdentity(file.path);
      const identity = parsed.source_identity;
      const sharedIdentity = toSharedParsedEpisodeIdentity(identity);
      const episodeNumber =
        identity && identity.scheme !== "daily" ? identity.episode_numbers[0] : undefined;

      const metadata = buildScannedFileMetadata({
        filePath: file.path,
        ...(parsed.group === undefined ? {} : { group: parsed.group }),
        ...(sharedIdentity === undefined ? {} : { sourceIdentity: sharedIdentity }),
      });

      const baseFile: VideoFile = {
        air_date: metadata.air_date,
        audio_channels: metadata.audio_channels,
        audio_codec: metadata.audio_codec,
        episode_number: episodeNumber,
        episode_numbers:
          identity && identity.scheme !== "daily" ? [...identity.episode_numbers] : undefined,
        episode_title: metadata.episode_title,
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
        ? yield* input.mediaProbe.probeVideoFile(file.path).pipe(
            Effect.map((result) =>
              result._tag === "MediaProbeMetadataFound" ? result.metadata : undefined,
            ),
            Effect.catchAll(() => Effect.as(Effect.void, undefined)),
          )
        : undefined;
      const mergedMetadata = mergeProbedMediaMetadata(mergedWithCachedMetadata, probedMetadata);

      if (probedMetadata && cachedRowsForFile.length > 0) {
        yield* tryDatabasePromise("Failed to cache probed media metadata", async () => {
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

            await input.db.update(episodes).set(patch).where(eq(episodes.id, row.id));
          }
        });
      }

      return mergedMetadata;
    });

    return yield* Effect.forEach(files, processAnimeFile, { concurrency: 4 });
  },
);
