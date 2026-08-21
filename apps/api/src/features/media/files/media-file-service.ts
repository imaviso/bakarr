import { Effect } from "effect";
import {
  brandMediaId,
  type AsyncOperationAccepted,
  type VideoFile,
} from "@packages/shared/index.ts";

import type { DatabaseError } from "@/db/database.ts";
import { EventBus } from "@/features/events/event-bus.ts";
import { nowIso as currentNowIso } from "@/infra/time.ts";
import { FileSystem } from "@/infra/filesystem/filesystem.ts";
import { isWithinPathRoot } from "@/infra/filesystem/filesystem.ts";
import { MediaProbe } from "@/infra/media/probe.ts";
import {
  mergeProbedMediaMetadata,
  probeMediaMetadataOrUndefined,
  type ProbedMediaMetadata,
  shouldProbeDetailedMediaMetadata,
} from "@/infra/media/probe.ts";
import {
  classifyMediaArtifact,
  parseFileSourceIdentity,
  toSharedParsedEpisodeIdentity,
} from "@/infra/media/identity/identity.ts";
import {
  collectVideoFiles,
  collectVolumeFiles,
  extractUnitNumbersFromFile,
} from "@/features/media/files/files.ts";
import { buildScannedFileMetadata } from "@/infra/media/identity/scanned-file-metadata.ts";
import {
  loadMediaRoot,
  validateUnitFilePath,
} from "@/features/media/files/media-file-path-policy.ts";
import { buildAiringScheduleMap } from "@/features/media/units/media-schedule-repository.ts";
import { inferAiredAt } from "@/domain/media/derivations.ts";
import { MediaRepository } from "@/features/media/shared/media-repository.ts";
import { MediaUnitRepository } from "@/features/media/units/media-unit-repository.ts";
import { SystemLogRepository } from "@/features/system/repository/log-repository.ts";
import {
  DomainPathError,
  type InfrastructureError,
  type StoredDataError,
} from "@/features/errors.ts";
import type { MediaNotFoundError } from "@/features/media/errors.ts";
import { OperationsTaskLauncherService } from "@/features/operations/tasks/operations-task-launcher-service.ts";

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

export interface MediaFileServiceShape {
  readonly bulkMapUnitFiles: (
    mediaId: number,
    mappings: readonly { unit_number: number; file_path: string }[],
  ) => Effect.Effect<void, DatabaseError | MediaNotFoundError | DomainPathError>;
  readonly deleteUnitFile: (
    mediaId: number,
    unitNumber: number,
  ) => Effect.Effect<void, DatabaseError | MediaNotFoundError | DomainPathError>;
  readonly listFiles: (
    mediaId: number,
  ) => Effect.Effect<readonly VideoFile[], DatabaseError | MediaNotFoundError | DomainPathError>;
  readonly mapUnitFile: (
    mediaId: number,
    unitNumber: number,
    filePath: string,
  ) => Effect.Effect<void, DatabaseError | MediaNotFoundError | DomainPathError | StoredDataError>;
  readonly scanFolder: (
    mediaId: number,
  ) => Effect.Effect<
    { readonly found: number; readonly total: number },
    DatabaseError | MediaNotFoundError | DomainPathError | StoredDataError
  >;
  readonly startMediaFolderScan: (
    mediaId: number,
  ) => Effect.Effect<AsyncOperationAccepted, DatabaseError | InfrastructureError>;
}

const makeMediaFileService = Effect.fn("MediaFileService.make")(function* () {
  const eventBus = yield* EventBus;
  const fs = yield* FileSystem;
  const mediaProbe = yield* MediaProbe;
  const mediaRepository = yield* MediaRepository;
  const mediaUnitRepository = yield* MediaUnitRepository;
  const systemLogRepository = yield* SystemLogRepository;
  const taskLauncher = yield* OperationsTaskLauncherService;
  const nowIso = currentNowIso;

  const listFiles = Effect.fn("MediaFileService.listFiles")(function* (mediaId: number) {
    const mediaRow = yield* mediaRepository.getMediaRow(mediaId);
    const collectFiles = mediaRow.mediaKind === "anime" ? collectVideoFiles : collectVolumeFiles;
    const mediaRoot = yield* loadMediaRoot(fs, mediaRow.rootFolder).pipe(
      Effect.mapError(
        (cause) =>
          new DomainPathError({
            cause,
            message: "Media root folder does not exist or is inaccessible",
          }),
      ),
    );
    const files = yield* collectFiles(fs, mediaRoot).pipe(
      Effect.mapError(
        (cause) =>
          new DomainPathError({
            cause,
            message: "Media root folder does not exist or is inaccessible",
          }),
      ),
    );

    const mappedRows = yield* mediaRepository.listMappedUnitRows(mediaId);
    const cachedUnitRows: EpisodeMediaCacheRow[] = mappedRows.map((row) => ({
      audioChannels: row.audioChannels,
      audioCodec: row.audioCodec,
      durationSeconds: row.durationSeconds,
      filePath: row.filePath,
      id: row.id,
      resolution: row.resolution,
      videoCodec: row.videoCodec,
    }));

    const cachedUnitRowsByPath = new Map<string, EpisodeMediaCacheRow[]>();

    for (const row of cachedUnitRows) {
      if (!row.filePath) {
        continue;
      }

      const current = cachedUnitRowsByPath.get(row.filePath) ?? [];
      current.push(row);
      cachedUnitRowsByPath.set(row.filePath, current);
    }

    const processMediaFile = Effect.fn("MediaFileService.processMediaFile")(function* (file: {
      readonly name: string;
      readonly path: string;
      readonly size: number;
    }) {
      const cachedRowsForFile = cachedUnitRowsByPath.get(file.path) ?? [];
      const parsed = parseFileSourceIdentity(file.path);
      const identity = parsed.source_identity;
      const sharedIdentity = toSharedParsedEpisodeIdentity(identity);
      const isVolumeMedia = mediaRow.mediaKind !== "anime";
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
        ? yield* probeMediaMetadataOrUndefined(mediaProbe, file.path)
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

          yield* mediaUnitRepository.patchUnitProbeMetadata(row.id, patch);
        }
      }

      return mergedMetadata;
    });

    return yield* Effect.forEach(files, processMediaFile, { concurrency: 4 });
  });

  const clearMissingUnitFileMappingsEffect = Effect.fn(
    "MediaFileService.clearMissingUnitFileMappingsEffect",
  )(function* (mediaId: number, presentFilePaths: readonly string[]) {
    const presentFilePathSet = new Set(presentFilePaths);
    const mappedRows = yield* mediaRepository.listMappedUnitRows(mediaId);

    for (const row of mappedRows) {
      if (row.filePath !== null && !presentFilePathSet.has(row.filePath)) {
        yield* mediaUnitRepository.clearUnitMapping(mediaId, row.number);
      }
    }
  });

  const scanFolder = Effect.fn("MediaFileService.scanFolder")(function* (mediaId: number) {
    const mediaRow = yield* mediaRepository.getMediaRow(mediaId);

    yield* eventBus.publish({
      type: "ScanFolderStarted",
      payload: {
        media_id: brandMediaId(mediaId),
        title: mediaRow.titleRomaji,
      },
    });

    const collectFiles = mediaRow.mediaKind === "anime" ? collectVideoFiles : collectVolumeFiles;
    const mediaRoot = yield* loadMediaRoot(fs, mediaRow.rootFolder).pipe(
      Effect.mapError(
        (cause) =>
          new DomainPathError({
            cause,
            message: "Media root folder does not exist or is inaccessible",
          }),
      ),
    );
    const files = yield* collectFiles(fs, mediaRoot).pipe(
      Effect.mapError(
        (cause) =>
          new DomainPathError({
            cause,
            message: "Media root folder does not exist or is inaccessible",
          }),
      ),
    );

    yield* clearMissingUnitFileMappingsEffect(
      mediaId,
      files.map((file) => file.path),
    );

    let found = 0;
    const airingScheduleByEpisode = buildAiringScheduleMap(
      mediaRow.nextAiringAt && mediaRow.nextAiringUnit
        ? [
            {
              airingAt: mediaRow.nextAiringAt,
              episode: mediaRow.nextAiringUnit,
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
        ...(parsed.group === undefined ? {} : { group: parsed.group }),
        ...(toSharedParsedEpisodeIdentity(parsed.source_identity) === undefined
          ? {}
          : { sourceIdentity: toSharedParsedEpisodeIdentity(parsed.source_identity) }),
      });

      const probeInput = {
        ...(metadata.audio_channels === undefined
          ? {}
          : { audio_channels: metadata.audio_channels }),
        ...(metadata.audio_codec === undefined ? {} : { audio_codec: metadata.audio_codec }),
        ...(metadata.duration_seconds === undefined
          ? {}
          : { duration_seconds: metadata.duration_seconds }),
        ...(parsed.resolution === undefined ? {} : { resolution: parsed.resolution }),
        ...(metadata.video_codec === undefined ? {} : { video_codec: metadata.video_codec }),
      };

      const probedMetadata = shouldProbeDetailedMediaMetadata(probeInput)
        ? yield* probeMediaMetadataOrUndefined(mediaProbe, file.path)
        : undefined;

      const mergedMetadata = mergeProbedMediaMetadata(probeInput, probedMetadata);

      const isVolumeMedia = mediaRow.mediaKind !== "anime";
      const unitNumbers = extractUnitNumbersFromFile(file.name, file.path, isVolumeMedia);
      if (unitNumbers.length === 0) {
        continue;
      }

      const currentIso = yield* nowIso();

      for (const unitNumber of unitNumbers) {
        yield* mediaUnitRepository.upsertUnit(mediaId, unitNumber, {
          aired: inferAiredAt(
            mediaRow.status,
            unitNumber,
            mediaRow.unitCount ?? undefined,
            mediaRow.startDate ?? undefined,
            mediaRow.endDate ?? undefined,
            airingScheduleByEpisode,
            currentIso,
          ),
          downloaded: true,
          filePath: file.path,
          fileSize: file.size,
          ...(mergedMetadata.duration_seconds === undefined
            ? {}
            : { durationSeconds: mergedMetadata.duration_seconds }),
          groupName: parsed.group ?? null,
          ...(mergedMetadata.resolution === undefined
            ? {}
            : { resolution: mergedMetadata.resolution }),
          ...(metadata.quality === undefined ? {} : { quality: metadata.quality }),
          ...(mergedMetadata.video_codec === undefined
            ? {}
            : { videoCodec: mergedMetadata.video_codec }),
          ...(mergedMetadata.audio_codec === undefined
            ? {}
            : { audioCodec: mergedMetadata.audio_codec }),
          ...(mergedMetadata.audio_channels === undefined
            ? {}
            : { audioChannels: mergedMetadata.audio_channels }),
          // No `title` here: folder scans cannot know unit titles, and an
          // explicit null would clobber titles synced from AniDB/AniList until
          // the next provider sync. Omitting keeps the stored value.
        });
      }
      found += unitNumbers.length;
    }

    yield* systemLogRepository.appendLog(
      "media.folder.scanned",
      "success",
      `Scanned ${mediaRow.titleRomaji} folder and found ${found} files`,
      nowIso,
    );
    yield* eventBus.publish({
      type: "ScanFolderFinished",
      payload: { media_id: brandMediaId(mediaId), found, title: mediaRow.titleRomaji },
    });

    return { found, total: files.length };
  });

  const deleteUnitFile = Effect.fn("MediaFileService.deleteUnitFile")(function* (
    mediaId: number,
    unitNumber: number,
  ) {
    const mediaRow = yield* mediaRepository.getMediaRow(mediaId);
    const unitState = yield* mediaRepository.loadCurrentUnitState(mediaId, unitNumber);
    const filePath = unitState._tag === "Some" ? unitState.value.filePath : undefined;

    if (filePath) {
      const resolvedPath = yield* fs.realPath(filePath).pipe(
        Effect.mapError(
          (cause) =>
            new DomainPathError({
              cause,
              message: "MediaUnit file path does not exist or is inaccessible",
            }),
        ),
      );
      const mediaRoot = yield* loadMediaRoot(fs, mediaRow.rootFolder);

      if (!isWithinPathRoot(resolvedPath, mediaRoot)) {
        yield* new DomainPathError({
          message: "File path is not within the media root folder",
        });
      }

      yield* fs.remove(resolvedPath).pipe(
        Effect.mapError(
          (cause) =>
            new DomainPathError({
              cause,
              message: "Failed to delete episode file from disk",
            }),
        ),
      );
    }

    yield* mediaUnitRepository.clearUnitMapping(mediaId, unitNumber);
    yield* eventBus.publishInfo(`Deleted mapped file for media ${mediaId} episode ${unitNumber}`);
  });

  const mapUnitFile = Effect.fn("MediaFileService.mapUnitFile")(function* (
    mediaId: number,
    unitNumber: number,
    filePath: string,
  ) {
    const mediaRow = yield* mediaRepository.getMediaRow(mediaId);

    if (filePath.trim().length === 0) {
      yield* mediaUnitRepository.clearUnitMapping(mediaId, unitNumber);
      yield* eventBus.publishInfo(`Mapped file for media ${mediaId} episode ${unitNumber}`);
      return;
    }

    const mediaRoot = yield* loadMediaRoot(fs, mediaRow.rootFolder);
    // Store the canonicalized path so later scans compare like with like.
    const canonicalFilePath = yield* validateUnitFilePath({
      filePath,
      fs,
      mediaRoot,
      outOfRootMessage: "File path is not within the media root folder",
    });

    yield* mediaUnitRepository.upsertUnit(mediaId, unitNumber, {
      downloaded: true,
      filePath: canonicalFilePath,
    });
    yield* eventBus.publishInfo(`Mapped file for media ${mediaId} episode ${unitNumber}`);
  });

  const bulkMapUnitFiles = Effect.fn("MediaFileService.bulkMapUnitFiles")(function* (
    mediaId: number,
    mappings: readonly { unit_number: number; file_path: string }[],
  ) {
    const mediaRow = yield* mediaRepository.getMediaRow(mediaId);
    const mediaRoot = yield* loadMediaRoot(fs, mediaRow.rootFolder);

    const validated: {
      unit_number: number;
      file_path: string;
      clear: boolean;
    }[] = [];

    for (const mapping of mappings) {
      if (mapping.file_path.trim().length === 0) {
        validated.push({
          unit_number: mapping.unit_number,
          file_path: "",
          clear: true,
        });
        continue;
      }

      // Store the canonicalized path so later scans compare like with like.
      const canonicalFilePath = yield* validateUnitFilePath({
        filePath: mapping.file_path,
        fs,
        mediaRoot,
        outOfRootMessage: `File path for episode ${mapping.unit_number} is not within the media root folder`,
      });

      validated.push({
        unit_number: mapping.unit_number,
        file_path: canonicalFilePath,
        clear: false,
      });
    }

    yield* mediaUnitRepository.bulkMapUnitFiles(mediaId, validated);
    yield* eventBus.publishInfo(`Bulk mapped ${mappings.length} files for media ${mediaId}`);
  });

  const startMediaFolderScan = Effect.fn("MediaFileService.startMediaFolderScan")(function* (
    mediaId: number,
  ) {
    return yield* taskLauncher.launch({
      mediaId,
      failureMessage: `Folder scan failed for media ${mediaId}`,
      operation: () => scanFolder(mediaId),
      queuedMessage: `Queued folder scan for media ${mediaId}`,
      runningMessage: `Scanning folder for media ${mediaId}`,
      successMessage: (result) =>
        `Folder scan completed for media ${mediaId}: found ${result.found} files`,
      successProgress: (result) => ({
        progressCurrent: result.found,
        progressTotal: result.total,
      }),
      successPayload: (result) => ({
        media_id: brandMediaId(mediaId),
        found: result.found,
        total: result.total,
      }),
      failurePayload: () => ({
        media_id: brandMediaId(mediaId),
      }),
      taskKey: "media_scan_folder",
    });
  });

  return {
    bulkMapUnitFiles,
    deleteUnitFile,
    listFiles,
    mapUnitFile,
    scanFolder,
    startMediaFolderScan,
  } satisfies MediaFileServiceShape;
});

export class MediaFileService extends Effect.Service<MediaFileService>()(
  "@bakarr/api/MediaFileService",
  {
    effect: makeMediaFileService(),
    dependencies: [
      MediaRepository.Default,
      MediaUnitRepository.Default,
      OperationsTaskLauncherService.Default,
      SystemLogRepository.Default,
    ],
  },
) {}

export const MediaFileServiceLive = MediaFileService.Default;
