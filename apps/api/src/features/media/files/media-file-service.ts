import { Effect } from "effect";

import type { VideoFile } from "@packages/shared/index.ts";
import { AppDrizzleDatabase, type DatabaseError } from "@/db/database.ts";
import { EventBus } from "@/features/events/event-bus.ts";
import { ClockService, nowIsoFromClock } from "@/infra/clock.ts";
import { FileSystem } from "@/infra/filesystem/filesystem.ts";
import { MediaProbe } from "@/infra/media/probe.ts";
import { listAnimeFilesEffect } from "@/features/media/files/media-file-list.ts";
import { scanAnimeFolderOrchestrationEffect } from "@/features/media/files/media-folder-scan-orchestration.ts";
import {
  bulkMapEpisodeFilesEffect,
  deleteEpisodeFileEffect,
  mapEpisodeFileEffect,
} from "@/features/media/files/media-file-write.ts";
import { MediaReadRepository } from "@/features/media/shared/media-read-repository.ts";
import type { DomainPathError, StoredDataError } from "@/features/errors.ts";
import type { MediaNotFoundError } from "@/features/media/errors.ts";

export interface AnimeFileServiceShape {
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

const makeAnimeFileService = Effect.fn("AnimeFileService.make")(function* () {
  const db = yield* AppDrizzleDatabase;
  const eventBus = yield* EventBus;
  const fs = yield* FileSystem;
  const mediaProbe = yield* MediaProbe;
  const mediaReadRepository = yield* MediaReadRepository;
  const clock = yield* ClockService;
  const nowIso = () => nowIsoFromClock(clock);

  const listFiles = Effect.fn("AnimeFileService.listFiles")(function* (mediaId: number) {
    return yield* listAnimeFilesEffect({ mediaId, db, fs, mediaReadRepository, mediaProbe });
  });

  const scanFolder = Effect.fn("AnimeFileService.scanFolder")(function* (mediaId: number) {
    return yield* scanAnimeFolderOrchestrationEffect({
      mediaId,
      db,
      eventPublisher: eventBus,
      fs,
      mediaReadRepository,
      mediaProbe,
      nowIso,
    });
  });

  const deleteEpisodeFile = Effect.fn("AnimeFileService.deleteEpisodeFile")(function* (
    mediaId: number,
    unitNumber: number,
  ) {
    yield* deleteEpisodeFileEffect({ mediaId, db, mediaReadRepository, unitNumber, fs });
    yield* eventBus.publishInfo(`Deleted mapped file for media ${mediaId} episode ${unitNumber}`);
  });

  const mapEpisodeFile = Effect.fn("AnimeFileService.mapEpisodeFile")(function* (
    mediaId: number,
    unitNumber: number,
    filePath: string,
  ) {
    yield* mapEpisodeFileEffect({ mediaId, db, mediaReadRepository, unitNumber, filePath, fs });
    yield* eventBus.publishInfo(`Mapped file for media ${mediaId} episode ${unitNumber}`);
  });

  const bulkMapEpisodeFiles = Effect.fn("AnimeFileService.bulkMapEpisodeFiles")(function* (
    mediaId: number,
    mappings: readonly { unit_number: number; file_path: string }[],
  ) {
    yield* bulkMapEpisodeFilesEffect({ mediaId, db, fs, mediaReadRepository, mappings });
    yield* eventBus.publishInfo(
      `Updated ${mappings.length} episode mapping(s) for media ${mediaId}`,
    );
  });

  return {
    bulkMapEpisodeFiles,
    deleteEpisodeFile,
    listFiles,
    mapEpisodeFile,
    scanFolder,
  } satisfies AnimeFileServiceShape;
});

export class AnimeFileService extends Effect.Service<AnimeFileService>()(
  "@bakarr/api/AnimeFileService",
  {
    effect: makeAnimeFileService(),
  },
) {}

export const AnimeFileServiceLive = AnimeFileService.Default;
