import { Context, Effect, Layer } from "effect";

import type { VideoFile } from "@packages/shared/index.ts";
import { Database, type DatabaseError } from "@/db/database.ts";
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
import type {
  MediaNotFoundError,
  MediaPathError,
  MediaStoredDataError,
} from "@/features/media/errors.ts";

export interface AnimeFileServiceShape {
  readonly bulkMapEpisodeFiles: (
    mediaId: number,
    mappings: readonly { unit_number: number; file_path: string }[],
  ) => Effect.Effect<void, DatabaseError | MediaNotFoundError | MediaPathError>;
  readonly deleteEpisodeFile: (
    mediaId: number,
    unitNumber: number,
  ) => Effect.Effect<void, DatabaseError | MediaNotFoundError | MediaPathError>;
  readonly listFiles: (
    mediaId: number,
  ) => Effect.Effect<readonly VideoFile[], DatabaseError | MediaNotFoundError | MediaPathError>;
  readonly mapEpisodeFile: (
    mediaId: number,
    unitNumber: number,
    filePath: string,
  ) => Effect.Effect<
    void,
    DatabaseError | MediaNotFoundError | MediaPathError | MediaStoredDataError
  >;
  readonly scanFolder: (
    mediaId: number,
  ) => Effect.Effect<
    { readonly found: number; readonly total: number },
    DatabaseError | MediaNotFoundError | MediaPathError | MediaStoredDataError
  >;
}

export class AnimeFileService extends Context.Tag("@bakarr/api/AnimeFileService")<
  AnimeFileService,
  AnimeFileServiceShape
>() {}

const makeAnimeFileService = Effect.gen(function* () {
  const { db } = yield* Database;
  const eventBus = yield* EventBus;
  const fs = yield* FileSystem;
  const mediaProbe = yield* MediaProbe;
  const clock = yield* ClockService;
  const nowIso = () => nowIsoFromClock(clock);

  const listFiles = Effect.fn("AnimeFileService.listFiles")(function* (mediaId: number) {
    return yield* listAnimeFilesEffect({ mediaId, db, fs, mediaProbe });
  });

  const scanFolder = Effect.fn("AnimeFileService.scanFolder")(function* (mediaId: number) {
    return yield* scanAnimeFolderOrchestrationEffect({
      mediaId,
      db,
      eventPublisher: eventBus,
      fs,
      mediaProbe,
      nowIso,
    });
  });

  const deleteEpisodeFile = Effect.fn("AnimeFileService.deleteEpisodeFile")(function* (
    mediaId: number,
    unitNumber: number,
  ) {
    yield* deleteEpisodeFileEffect({ mediaId, db, unitNumber, fs });
    yield* eventBus.publishInfo(`Deleted mapped file for media ${mediaId} episode ${unitNumber}`);
  });

  const mapEpisodeFile = Effect.fn("AnimeFileService.mapEpisodeFile")(function* (
    mediaId: number,
    unitNumber: number,
    filePath: string,
  ) {
    yield* mapEpisodeFileEffect({ mediaId, db, unitNumber, filePath, fs });
    yield* eventBus.publishInfo(`Mapped file for media ${mediaId} episode ${unitNumber}`);
  });

  const bulkMapEpisodeFiles = Effect.fn("AnimeFileService.bulkMapEpisodeFiles")(function* (
    mediaId: number,
    mappings: readonly { unit_number: number; file_path: string }[],
  ) {
    yield* bulkMapEpisodeFilesEffect({ mediaId, db, fs, mappings });
    yield* eventBus.publishInfo(
      `Updated ${mappings.length} episode mapping(s) for media ${mediaId}`,
    );
  });

  return AnimeFileService.of({
    bulkMapEpisodeFiles,
    deleteEpisodeFile,
    listFiles,
    mapEpisodeFile,
    scanFolder,
  });
});

export const AnimeFileServiceLive = Layer.effect(AnimeFileService, makeAnimeFileService);
