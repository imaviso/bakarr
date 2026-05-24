import { Effect } from "effect";

import { AppDrizzleDatabase } from "@/db/database.ts";
import { ClockService, nowIsoFromClock } from "@/infra/clock.ts";
import { FileSystem } from "@/infra/filesystem/filesystem.ts";
import { AniListClient } from "@/features/media/metadata/anilist.ts";
import { EventBus } from "@/features/events/event-bus.ts";
import {
  makeUnmappedScanWorkflow,
  type UnmappedScanWorkflowShape,
} from "@/features/operations/unmapped/unmapped-orchestration-scan.ts";
import { type UnmappedScanQueryShape } from "@/features/operations/unmapped/unmapped-orchestration-scan-query.ts";
import { UnmappedScanCoordinator } from "@/features/operations/tasks/runtime-support.ts";
import { tryDatabasePromise } from "@/infra/effect/db.ts";
import { SystemUnmappedRepository } from "@/features/system/repository/unmapped-repository.ts";
import { RuntimeConfigSnapshotService } from "@/features/system/runtime-config-snapshot-service.ts";
import { MEDIA_KIND_VALUES } from "@packages/shared/index.ts";
import { getLibraryPathForMediaKind } from "@/features/media/shared/config-support.ts";
import { StoredDataError } from "@/features/errors.ts";

export interface UnmappedScanServiceShape {
  readonly getUnmappedFolders: UnmappedScanQueryShape["getUnmappedFolders"];
  readonly matchAndPersistUnmappedFolder: UnmappedScanQueryShape["matchAndPersistUnmappedFolder"];
  readonly runUnmappedScan: UnmappedScanWorkflowShape["runUnmappedScan"];
}

const makeUnmappedScanService = Effect.fn("UnmappedScanService.make")(function* () {
  const db = yield* AppDrizzleDatabase;
  const aniList = yield* AniListClient;
  const fs = yield* FileSystem;
  const runtimeConfigSnapshot = yield* RuntimeConfigSnapshotService;
  const systemUnmappedRepository = yield* SystemUnmappedRepository;
  const clock = yield* ClockService;
  const eventBus = yield* EventBus;
  const unmappedScanCoordinator = yield* UnmappedScanCoordinator;

  const scanWorkflow = makeUnmappedScanWorkflow({
    aniList,
    db,
    eventBus,
    unmappedScanCoordinator,
    fs,
    nowIso: () => nowIsoFromClock(clock),
    roots: Effect.fn("UnmappedScanService.getConfiguredRoots")(function* () {
      const config = yield* runtimeConfigSnapshot.getRuntimeConfig().pipe(
        Effect.mapError((error) =>
          error._tag === "DatabaseError"
            ? error
            : new StoredDataError({
                cause: error,
                message: "Stored runtime config is unavailable for unmapped scan",
              }),
        ),
      );
      return MEDIA_KIND_VALUES.map((mediaKind) => ({
        mediaKind,
        path: getLibraryPathForMediaKind(config.library, mediaKind),
      }));
    }),
    systemUnmappedRepository,
    tryDatabasePromise,
  });

  return {
    getUnmappedFolders: scanWorkflow.getUnmappedFolders,
    matchAndPersistUnmappedFolder: scanWorkflow.matchAndPersistUnmappedFolder,
    runUnmappedScan: scanWorkflow.runUnmappedScan,
  } satisfies UnmappedScanServiceShape;
});

export class UnmappedScanService extends Effect.Service<UnmappedScanService>()(
  "@bakarr/api/UnmappedScanService",
  { effect: makeUnmappedScanService() },
) {}

export const UnmappedScanServiceLive = UnmappedScanService.Default;
