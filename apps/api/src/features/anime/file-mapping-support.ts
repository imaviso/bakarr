import { and, eq, isNotNull } from "drizzle-orm";
import { Effect, Schema } from "effect";

import type { AppDatabase, DatabaseError } from "../../db/database.ts";
import { episodes } from "../../db/schema.ts";
import type { FileSystemShape } from "../../lib/filesystem.ts";
import { isWithinPathRoot } from "../../lib/filesystem.ts";
import { nowIso } from "../../lib/clock.ts";
import {
  type MediaProbeShape,
  mergeProbedMediaMetadata,
  type ProbedMediaMetadata,
  shouldProbeDetailedMediaMetadata,
} from "../../lib/media-probe.ts";
import type { VideoFile } from "../../../../../packages/shared/src/index.ts";
import { classifyMediaArtifact, parseFileSourceIdentity } from "../../lib/media-identity.ts";
import { collectVideoFiles } from "./files.ts";
import { AnimePathError, type AnimeServiceError } from "./errors.ts";
import { buildScannedFileMetadata } from "../operations/naming-support.ts";
import { summarizeEpisodeCoverage } from "../operations/library-import.ts";
import {
  buildAiringScheduleMap,
  bulkMapEpisodeFilesAtomicEffect,
  clearEpisodeMappingEffect,
  getAnimeRowEffect,
  getEpisodeRowEffect,
  inferAiredAt,
  upsertEpisodeEffect,
} from "./repository.ts";
import { tryDatabasePromise } from "../../lib/effect-db.ts";
import { wrapAnimeError } from "./service-support.ts";

const mapAnimeDbError = (message: string) => Effect.mapError(wrapAnimeError(message));

export class EpisodeFileResolved extends Schema.TaggedClass<EpisodeFileResolved>()(
  "EpisodeFileResolved",
  {
    fileName: Schema.String,
    filePath: Schema.String,
  },
) {}

export class EpisodeFileUnmapped extends Schema.TaggedClass<EpisodeFileUnmapped>()(
  "EpisodeFileUnmapped",
  {},
) {}

export class EpisodeFileRootInaccessible extends Schema.TaggedClass<EpisodeFileRootInaccessible>()(
  "EpisodeFileRootInaccessible",
  { rootFolder: Schema.String },
) {}

export class EpisodeFileMissing extends Schema.TaggedClass<EpisodeFileMissing>()(
  "EpisodeFileMissing",
  {
    filePath: Schema.String,
  },
) {}

export class EpisodeFileOutsideRoot extends Schema.TaggedClass<EpisodeFileOutsideRoot>()(
  "EpisodeFileOutsideRoot",
  {
    animeRoot: Schema.String,
    filePath: Schema.String,
  },
) {}

export type EpisodeFileResolution =
  | EpisodeFileResolved
  | EpisodeFileUnmapped
  | EpisodeFileRootInaccessible
  | EpisodeFileMissing
  | EpisodeFileOutsideRoot;

export const loadAnimeRoot = Effect.fn("AnimeService.loadAnimeRoot")(function* (
  fs: FileSystemShape,
  rootFolder: string,
) {
  return yield* fs.realPath(rootFolder).pipe(
    Effect.mapError(
      () =>
        new AnimePathError({
          message: "Anime root folder does not exist",
        }),
    ),
  );
});

export const validateEpisodeFilePath = Effect.fn("AnimeService.validateEpisodeFilePath")(
  function* (input: {
    animeRoot: string;
    filePath: string;
    fs: FileSystemShape;
    outOfRootMessage: string;
  }) {
    const resolvedPath = yield* input.fs.realPath(input.filePath).pipe(
      Effect.mapError(
        () =>
          new AnimePathError({
            message: "File path does not exist or is inaccessible",
          }),
      ),
    );

    if (!isWithinPathRoot(resolvedPath, input.animeRoot)) {
      return yield* new AnimePathError({
        message: input.outOfRootMessage,
      });
    }

    return resolvedPath;
  },
);

export const loadAnimeFiles = Effect.fn("AnimeService.loadAnimeFiles")(function* (
  fs: FileSystemShape,
  rootFolder: string,
) {
  return yield* collectVideoFiles(fs, rootFolder).pipe(
    Effect.mapError(
      () =>
        new AnimePathError({
          message: "Anime root folder does not exist or is inaccessible",
        }),
    ),
  );
});

export const scanAnimeFolderEffect = Effect.fn("AnimeService.scanAnimeFolderEffect")(
  function* (input: {
    animeId: number;
    db: AppDatabase;
    fs: FileSystemShape;
    mediaProbe: MediaProbeShape;
  }) {
    const animeRow = yield* getAnimeRowEffect(input.db, input.animeId).pipe(
      mapAnimeDbError("Failed to scan anime folder"),
    );
    const files = yield* loadAnimeFiles(input.fs, animeRow.rootFolder);
    let found = 0;
    const airingScheduleByEpisode = buildAiringScheduleMap(
      animeRow.nextAiringAt && animeRow.nextAiringEpisode
        ? [
            {
              airingAt: animeRow.nextAiringAt,
              episode: animeRow.nextAiringEpisode,
            },
          ]
        : undefined,
    );

    for (const file of files) {
      const classification = classifyMediaArtifact(file.path, file.name);
      if (classification.kind === "extra" || classification.kind === "sample") {
        continue;
      }

      const parsed = parseFileSourceIdentity(file.path);
      const metadata = buildScannedFileMetadata({
        filePath: file.path,
        group: parsed.group,
        sourceIdentity: toSharedParsedEpisodeIdentity(parsed.source_identity),
      });
      const probeInput = {
        audio_channels: metadata.audio_channels,
        audio_codec: metadata.audio_codec,
        duration_seconds: metadata.duration_seconds,
        resolution: parsed.resolution ?? undefined,
        video_codec: metadata.video_codec,
      };
      const probeResult = shouldProbeDetailedMediaMetadata(probeInput)
        ? yield* input.mediaProbe.probeVideoFile(file.path)
        : undefined;
      const mergedMetadata = mergeProbedMediaMetadata(
        probeInput,
        probeResult?._tag === "MediaProbeMetadataFound" ? probeResult.metadata : undefined,
      );
      const identity = parsed.source_identity;
      if (!identity || identity.scheme === "daily") {
        continue;
      }

      const episodeNumbers = identity.episode_numbers;
      if (episodeNumbers.length === 0) {
        continue;
      }

      const currentIso = yield* nowIso;

      for (const episodeNumber of episodeNumbers) {
        yield* upsertEpisodeEffect(input.db, input.animeId, episodeNumber, {
          aired: inferAiredAt(
            animeRow.status,
            episodeNumber,
            animeRow.episodeCount ?? undefined,
            animeRow.startDate ?? undefined,
            animeRow.endDate ?? undefined,
            airingScheduleByEpisode,
            currentIso,
          ),
          downloaded: true,
          filePath: file.path,
          fileSize: file.size,
          durationSeconds: mergedMetadata.duration_seconds,
          groupName: parsed.group ?? null,
          resolution: mergedMetadata.resolution,
          quality: metadata.quality,
          videoCodec: mergedMetadata.video_codec,
          audioCodec: mergedMetadata.audio_codec,
          audioChannels: mergedMetadata.audio_channels,
          title: null,
        }).pipe(mapAnimeDbError("Failed to scan anime folder"));
      }
      found += episodeNumbers.length;
    }

    return {
      animeRow,
      found,
      total: files.length,
    };
  },
);

export const deleteEpisodeFileEffect = Effect.fn("AnimeService.deleteEpisodeFileEffect")(
  function* (input: {
    animeId: number;
    db: AppDatabase;
    episodeNumber: number;
    fs: FileSystemShape;
  }) {
    const animeRow = yield* getAnimeRowEffect(input.db, input.animeId).pipe(
      mapAnimeDbError("Failed to delete episode file"),
    );
    const episodeRow = yield* getEpisodeRowEffect(
      input.db,
      input.animeId,
      input.episodeNumber,
    ).pipe(mapAnimeDbError("Failed to delete episode file"));

    if (episodeRow.filePath) {
      const filePath = episodeRow.filePath;
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

    yield* clearEpisodeMappingEffect(input.db, input.animeId, input.episodeNumber).pipe(
      mapAnimeDbError("Failed to delete episode file"),
    );
  },
);

export const mapEpisodeFileEffect = Effect.fn("AnimeService.mapEpisodeFileEffect")(
  function* (input: {
    animeId: number;
    db: AppDatabase;
    episodeNumber: number;
    filePath: string;
    fs: FileSystemShape;
  }) {
    const animeRow = yield* getAnimeRowEffect(input.db, input.animeId).pipe(
      mapAnimeDbError("Failed to map episode file"),
    );

    if (input.filePath.trim().length === 0) {
      yield* clearEpisodeMappingEffect(input.db, input.animeId, input.episodeNumber).pipe(
        mapAnimeDbError("Failed to map episode file"),
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

    yield* upsertEpisodeEffect(input.db, input.animeId, input.episodeNumber, {
      downloaded: true,
      filePath: input.filePath,
    }).pipe(mapAnimeDbError("Failed to map episode file"));
  },
);

export const bulkMapEpisodeFilesEffect = Effect.fn("AnimeService.bulkMapEpisodeFilesEffect")(
  function* (input: {
    animeId: number;
    db: AppDatabase;
    fs: FileSystemShape;
    mappings: readonly { episode_number: number; file_path: string }[];
  }) {
    const animeRow = yield* getAnimeRowEffect(input.db, input.animeId).pipe(
      mapAnimeDbError("Failed to bulk-map episode files"),
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
        outOfRootMessage: `File path for episode ${mapping.episode_number} is not within the anime root folder`,
      });

      validated.push({
        episode_number: mapping.episode_number,
        file_path: mapping.file_path,
        clear: false,
      });
    }

    yield* bulkMapEpisodeFilesAtomicEffect(input.db, input.animeId, validated).pipe(
      mapAnimeDbError("Failed to bulk-map episode files"),
    );
  },
);

export const listAnimeFilesEffect = Effect.fn("AnimeService.listAnimeFilesEffect")(
  function* (input: {
    animeId: number;
    db: AppDatabase;
    fs: FileSystemShape;
    mediaProbe: MediaProbeShape;
  }) {
    const animeRow = yield* getAnimeRowEffect(input.db, input.animeId).pipe(
      mapAnimeDbError("Failed to list video files"),
    );
    const files = yield* loadAnimeFiles(input.fs, animeRow.rootFolder);
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

    return yield* Effect.forEach(
      files,
      (file) =>
        Effect.gen(function* () {
          const cachedRowsForFile = cachedEpisodeRowsByPath.get(file.path) ?? [];
          const parsed = parseFileSourceIdentity(file.path);
          const identity = parsed.source_identity;
          const sharedIdentity = toSharedParsedEpisodeIdentity(identity);
          const episodeNumber =
            identity && identity.scheme !== "daily" ? identity.episode_numbers[0] : undefined;
          const metadata = buildScannedFileMetadata({
            filePath: file.path,
            group: parsed.group,
            sourceIdentity: sharedIdentity,
          });
          const baseFile: VideoFile = {
            air_date: metadata.air_date,
            audio_channels: metadata.audio_channels,
            audio_codec: metadata.audio_codec,
            coverage_summary: summarizeEpisodeCoverage({
              airDate: metadata.air_date,
              episodeNumbers:
                identity && identity.scheme !== "daily" ? identity.episode_numbers : undefined,
            }),
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
          const probeResult = shouldProbeDetailedMediaMetadata(mergedWithCachedMetadata)
            ? yield* input.mediaProbe.probeVideoFile(file.path)
            : undefined;
          const probedMetadata =
            probeResult?._tag === "MediaProbeMetadataFound" ? probeResult.metadata : undefined;
          const mergedMetadata = mergeProbedMediaMetadata(mergedWithCachedMetadata, probedMetadata);

          if (probedMetadata && cachedRowsForFile.length > 0) {
            yield* tryDatabasePromise("Failed to cache probed media metadata", async () => {
              for (const row of cachedRowsForFile) {
                const patch = toEpisodeProbeCachePatch(row, mergedMetadata);
                if (!hasEpisodeProbeCachePatch(patch)) {
                  continue;
                }

                await input.db.update(episodes).set(patch).where(eq(episodes.id, row.id));
              }
            });
          }

          return mergedMetadata;
        }),
      { concurrency: 4 },
    );
  },
);

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
    readonly audio_channels?: string;
    readonly audio_codec?: string;
    readonly duration_seconds?: number;
    readonly resolution?: string;
    readonly video_codec?: string;
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

function toSharedParsedEpisodeIdentity(
  identity: ReturnType<typeof parseFileSourceIdentity>["source_identity"],
) {
  if (!identity) {
    return undefined;
  }

  switch (identity.scheme) {
    case "season":
      return {
        episode_numbers: [...identity.episode_numbers],
        label: identity.label,
        scheme: "season" as const,
        season: identity.season,
      };
    case "absolute":
      return {
        episode_numbers: [...identity.episode_numbers],
        label: identity.label,
        scheme: "absolute" as const,
      };
    case "daily":
      return {
        air_dates: [...identity.air_dates],
        label: identity.label,
        scheme: "daily" as const,
      };
  }
}

export const resolveEpisodeFileEffect = Effect.fn("AnimeService.resolveEpisodeFileEffect")(
  function* (input: {
    animeId: number;
    db: AppDatabase;
    episodeNumber: number;
    fs: FileSystemShape;
  }) {
    const animeRow = yield* getAnimeRowEffect(input.db, input.animeId).pipe(
      mapAnimeDbError("Failed to resolve episode file"),
    );
    const episodeRow = yield* getEpisodeRowEffect(
      input.db,
      input.animeId,
      input.episodeNumber,
    ).pipe(mapAnimeDbError("Failed to resolve episode file"));

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

export type AnimeFileMappingError = AnimeServiceError | DatabaseError;
