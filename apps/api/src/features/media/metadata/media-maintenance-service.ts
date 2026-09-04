import { dirname, join, resolve } from "node:path";
import { brandMediaId } from "@packages/shared/index.ts";
import type { AsyncOperationAccepted } from "@packages/shared/index.ts";

import type { DatabaseError } from "@/db/database.ts";
import { AppConfig } from "@/app/config/schema.ts";
import { MediaMetadataProviderService } from "@/features/media/metadata/media-metadata-provider-service.ts";
import { MediaImageCacheService } from "@/features/media/metadata/media-image-cache-service.ts";
import { syncMediaMetadataEffect } from "@/features/media/metadata/media-metadata-sync.ts";
import { MediaRepository } from "@/features/media/shared/media-repository.ts";
import { MediaUnitRepository } from "@/features/media/units/media-unit-repository.ts";
import { AniDbRuntimeConfigError, MediaNotFoundError } from "@/features/media/errors.ts";
import { makeMetadataRefreshRunner } from "@/features/media/metadata/metadata-refresh.ts";
import { pdfCacheDirectory } from "@/features/media/reader/pdf-reader.ts";
import { EventBus } from "@/infra/effect/event-bus.ts";
import { SystemLogRepository } from "@/features/system/repository/log-repository.ts";
import { nowIso as currentNowIso } from "@/infra/time.ts";
import { mediaUnits } from "@/db/schema.ts";
import { FileSystem, type FileSystemShape } from "@/infra/filesystem/filesystem.ts";
import { RuntimeConfigSnapshotService } from "@/features/system/runtime-config-snapshot-service.ts";
import type { ExternalCallError } from "@/infra/effect/retry.ts";
import type { InfrastructureError, StoredDataError } from "@/features/errors.ts";
import { OperationsTaskLauncherService } from "@/features/operations/tasks/operations-task-launcher-service.ts";
import { Context, Effect, Exit, Layer, Option } from "effect";

export interface MediaMaintenanceServiceShape {
  readonly deleteMedia: (id: number) => Effect.Effect<void, DatabaseError>;
  readonly refreshEpisodes: (
    mediaId: number,
  ) => Effect.Effect<
    void,
    | DatabaseError
    | MediaNotFoundError
    | ExternalCallError
    | StoredDataError
    | AniDbRuntimeConfigError
  >;
  readonly refreshMetadataForMonitoredMedia: () => Effect.Effect<
    { refreshed: number },
    DatabaseError | ExternalCallError
  >;
  readonly startUnitsRefresh: (
    mediaId: number,
  ) => Effect.Effect<AsyncOperationAccepted, DatabaseError | InfrastructureError>;
}

const makeMediaMaintenanceService = Effect.fn("MediaMaintenanceService.make")(function* () {
  const eventBus = yield* EventBus;
  const fs = yield* FileSystem;
  const appConfig = yield* AppConfig;
  const runtimeConfigSnapshot = yield* RuntimeConfigSnapshotService;
  const metadataProvider = yield* MediaMetadataProviderService;
  const imageCacheService = yield* MediaImageCacheService;
  const mediaRepository = yield* MediaRepository;
  const mediaUnitRepository = yield* MediaUnitRepository;
  const systemLogRepository = yield* SystemLogRepository;
  const taskLauncher = yield* OperationsTaskLauncherService;
  const nowIso = currentNowIso;
  const metadataRefreshRunner = yield* makeMetadataRefreshRunner();
  const readerCacheRoot = join(dirname(resolve(appConfig.databaseFile)), "reader-cache");

  const deleteMedia = Effect.fn("MediaMaintenanceService.deleteMedia")(function* (id: number) {
    // Snapshot mapped file paths before the rows are gone so cached renders
    // (keyed by path hash) can be pruned afterwards.
    const mappedUnitRows = yield* mediaRepository.listMappedUnitRows(id);

    yield* mediaRepository.deleteMedia(id);

    yield* pruneMediaCacheFiles({
      fs,
      id,
      mappedUnitRows,
      readerCacheRoot,
      runtimeConfigSnapshot,
    }).pipe(
      Effect.catch((cause) =>
        Effect.logWarning("Failed to prune cached files for deleted media").pipe(
          Effect.annotateLogs({ mediaId: id, cause: globalThis.String(cause) }),
        ),
      ),
    );

    yield* systemLogRepository.appendLog("media.deleted", "success", `Deleted media ${id}`, nowIso);
  });

  const refreshEpisodes = Effect.fn("MediaMaintenanceService.refreshEpisodes")(function* (
    mediaId: number,
  ) {
    const startMediaRow = yield* mediaRepository.getMediaRow(mediaId);

    yield* eventBus.publish({
      type: "RefreshStarted",
      payload: { media_id: brandMediaId(mediaId), title: startMediaRow.titleRomaji },
    });

    yield* Effect.gen(function* () {
      const { mediaRow, metadata, nextMediaRow } = yield* syncMediaMetadataEffect({
        imageCacheService,
        metadataProvider,
        mediaId,
        eventPublisher: Option.some(eventBus),
        mediaRepository,
        systemLogRepository,
        nowIso,
      });

      yield* mediaUnitRepository.syncUnitSchedule(
        mediaId,
        nextMediaRow,
        metadata?.futureAiringSchedule,
        nowIso,
      );
      yield* mediaUnitRepository.syncUnitMetadata(mediaId, metadata?.mediaUnits);
      yield* systemLogRepository.appendLog(
        "media.mediaUnits.refreshed",
        "success",
        `Refreshed mediaUnits for ${mediaRow.titleRomaji}`,
        nowIso,
      );
      yield* eventBus.publish({
        type: "RefreshFinished",
        payload: { media_id: brandMediaId(mediaId), title: mediaRow.titleRomaji },
      });
    }).pipe(
      Effect.onExit((exit) =>
        Exit.isSuccess(exit)
          ? Effect.void
          : eventBus.publish({
              type: "RefreshFinished",
              payload: { media_id: brandMediaId(mediaId), title: startMediaRow.titleRomaji },
            }),
      ),
    );
  });

  const refreshMetadataForMonitoredMedia = Effect.fn(
    "MediaMaintenanceService.refreshMetadataForMonitoredMedia",
  )(function* () {
    yield* eventBus.publishInfo("Metadata refresh started");
    const result = yield* metadataRefreshRunner.trigger;
    yield* eventBus.publishInfo(`Metadata refresh finished (${result.refreshed} media)`);
    return result;
  });

  const startUnitsRefresh = Effect.fn("MediaMaintenanceService.startUnitsRefresh")(function* (
    mediaId: number,
  ) {
    return yield* taskLauncher.launch({
      mediaId,
      failureMessage: `Episode metadata refresh failed for media ${mediaId}`,
      operation: () => refreshEpisodes(mediaId),
      queuedMessage: `Queued episode metadata refresh for media ${mediaId}`,
      runningMessage: `Refreshing episode metadata for media ${mediaId}`,
      successMessage: () => `Finished episode metadata refresh for media ${mediaId}`,
      taskKey: "media_refresh_units_manual",
    });
  });

  return {
    deleteMedia,
    refreshEpisodes,
    refreshMetadataForMonitoredMedia,
    startUnitsRefresh,
  } satisfies MediaMaintenanceServiceShape;
});

export class MediaMaintenanceService extends Context.Service<
  MediaMaintenanceService,
  MediaMaintenanceServiceShape
>()("@bakarr/api/MediaMaintenanceService") {
  static readonly layer = Layer.effect(MediaMaintenanceService, makeMediaMaintenanceService());
}

export const MediaMaintenanceServiceLive = MediaMaintenanceService.layer;

/**
 * Best-effort cleanup of on-disk caches for a deleted media entry: the
 * metadata image directory and the reader render cache directories of every
 * previously mapped unit file. Seasonal provider cache is shared across
 * media and is intentionally left alone.
 */
const pruneMediaCacheFiles = Effect.fn("MediaMaintenanceService.pruneMediaCacheFiles")(
  function* (input: {
    readonly fs: FileSystemShape;
    readonly id: number;
    readonly mappedUnitRows: ReadonlyArray<typeof mediaUnits.$inferSelect>;
    readonly readerCacheRoot: string;
    readonly runtimeConfigSnapshot: typeof RuntimeConfigSnapshotService.Service;
  }) {
    const config = yield* input.runtimeConfigSnapshot.getRuntimeConfig();
    const imagesRoot = `${config.general.images_path.replace(/\/$/, "")}/media/${input.id}`;

    yield* input.fs.remove(imagesRoot, { recursive: true });

    yield* Effect.forEach(
      input.mappedUnitRows,
      (row) => {
        if (row.filePath === null) {
          return Effect.void;
        }

        return prunePdfRenderCache(input.fs, input.readerCacheRoot, row.filePath).pipe(
          Effect.catchTag("FileSystemError", () => Effect.void),
        );
      },
      { discard: true },
    );
  },
);

/**
 * The render cache directory is keyed by `sha256(filePath + fileSize)`, so
 * prune with the size the renderer saw: the live file's stat first, falling
 * back to the persisted probe value.
 */
const prunePdfRenderCache = Effect.fn("MediaMaintenanceService.prunePdfRenderCache")(function* (
  fs: FileSystemShape,
  readerCacheRoot: string,
  filePath: string,
) {
  const statResult = yield* Effect.result(fs.stat(filePath));
  const fileSize = statResult._tag === "Success" ? statResult.success.size : 0;

  yield* fs.remove(pdfCacheDirectory({ cacheRoot: readerCacheRoot, filePath, fileSize }), {
    recursive: true,
  });
});
