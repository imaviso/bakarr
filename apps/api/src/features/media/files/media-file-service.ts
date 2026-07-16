import { Effect } from "effect";

import type { VideoFile } from "@packages/shared/index.ts";
import type { DatabaseError } from "@/db/database.ts";
import { EventBus } from "@/features/events/event-bus.ts";
import { nowIso as currentNowIso } from "@/infra/time.ts";
import { FileSystem } from "@/infra/filesystem/filesystem.ts";
import { MediaProbe } from "@/infra/media/probe.ts";
import { listMediaFilesEffect } from "@/features/media/files/media-file-list.ts";
import { scanMediaFolderOrchestrationEffect } from "@/features/media/files/media-folder-scan-orchestration.ts";
import {
  bulkMapEpisodeFilesEffect,
  deleteEpisodeFileEffect,
  mapEpisodeFileEffect,
} from "@/features/media/files/media-file-write.ts";
import { MediaRepository } from "@/features/media/shared/media-repository.ts";
import { MediaUnitRepository } from "@/features/media/units/media-unit-repository.ts";
import { SystemLogRepository } from "@/features/system/repository/log-repository.ts";
import type { DomainPathError, StoredDataError } from "@/features/errors.ts";
import type { MediaNotFoundError } from "@/features/media/errors.ts";

export interface MediaFileServiceShape {
  readonly bulkMapEpisodeFiles: (
    mediaId: number,
    mappings: readonly { unit_number: number; file_path: string }[],
  ) => Effect.Effect<void, DatabaseError | MediaNotFoundError | DomainPathError>;
  readonly deleteEpisodeFile: (
    mediaId: number,
    unitNumber: number,
  ) => Effect.Effect<void, DatabaseError | MediaNotFoundError | DomainPathError>;
  readonly listFiles: (
    mediaId: number,
  ) => Effect.Effect<readonly VideoFile[], DatabaseError | MediaNotFoundError | DomainPathError>;
  readonly mapEpisodeFile: (
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
}

const makeMediaFileService = Effect.fn("MediaFileService.make")(function* () {
  const eventBus = yield* EventBus;
  const fs = yield* FileSystem;
  const mediaProbe = yield* MediaProbe;
  const mediaReadRepository = yield* MediaRepository;
  const mediaUnitRepository = yield* MediaUnitRepository;
  const systemLogRepository = yield* SystemLogRepository;
  const nowIso = currentNowIso;

  const listFiles = Effect.fn("MediaFileService.listFiles")(function* (mediaId: number) {
    return yield* listMediaFilesEffect({
      mediaId,
      fs,
      mediaReadRepository,
      mediaUnitRepository,
      mediaProbe,
    });
  });

  const scanFolder = Effect.fn("MediaFileService.scanFolder")(function* (mediaId: number) {
    return yield* scanMediaFolderOrchestrationEffect({
      mediaId,
      eventPublisher: eventBus,
      fs,
      mediaReadRepository,
      mediaUnitRepository,
      mediaProbe,
      nowIso,
      systemLogRepository,
    });
  });

  const deleteEpisodeFile = Effect.fn("MediaFileService.deleteEpisodeFile")(function* (
    mediaId: number,
    unitNumber: number,
  ) {
    yield* deleteEpisodeFileEffect({
      mediaId,
      mediaReadRepository,
      mediaUnitRepository,
      unitNumber,
      fs,
    });
    yield* eventBus.publishInfo(`Deleted mapped file for media ${mediaId} episode ${unitNumber}`);
  });

  const mapEpisodeFile = Effect.fn("MediaFileService.mapEpisodeFile")(function* (
    mediaId: number,
    unitNumber: number,
    filePath: string,
  ) {
    yield* mapEpisodeFileEffect({
      mediaId,
      mediaReadRepository,
      mediaUnitRepository,
      unitNumber,
      filePath,
      fs,
    });
    yield* eventBus.publishInfo(`Mapped file for media ${mediaId} episode ${unitNumber}`);
  });

  const bulkMapEpisodeFiles = Effect.fn("MediaFileService.bulkMapEpisodeFiles")(function* (
    mediaId: number,
    mappings: readonly { unit_number: number; file_path: string }[],
  ) {
    yield* bulkMapEpisodeFilesEffect({
      mediaId,
      fs,
      mediaReadRepository,
      mediaUnitRepository,
      mappings,
    });
    yield* eventBus.publishInfo(`Bulk mapped ${mappings.length} files for media ${mediaId}`);
  });

  return {
    bulkMapEpisodeFiles,
    deleteEpisodeFile,
    listFiles,
    mapEpisodeFile,
    scanFolder,
  } satisfies MediaFileServiceShape;
});

export class MediaFileService extends Effect.Service<MediaFileService>()(
  "@bakarr/api/MediaFileService",
  {
    effect: makeMediaFileService(),
    dependencies: [
      MediaRepository.Default,
      MediaUnitRepository.Default,
      SystemLogRepository.Default,
    ],
  },
) {}

export const MediaFileServiceLive = MediaFileService.Default;
