import { Context, Effect, Layer } from "effect";

import type { DatabaseError } from "@/db/database.ts";
import { AnimeMaintenanceService } from "@/features/anime/anime-maintenance-service.ts";
import type { AnimeServiceError } from "@/features/anime/errors.ts";
import { CatalogDownloadCommandService } from "@/features/operations/catalog-download-command-service.ts";
import { CatalogLibraryScanService } from "@/features/operations/catalog-library-scan-service.ts";
import type { OperationsError } from "@/features/operations/errors.ts";
import { BackgroundSearchRssWorkerService } from "@/features/operations/background-search-rss-worker-service.ts";
import type { ExternalCallError } from "@/lib/effect-retry.ts";
import { RuntimeConfigSnapshotService } from "@/features/system/runtime-config-snapshot-service.ts";
import type { RuntimeConfigSnapshotError } from "@/features/system/runtime-config-snapshot-service.ts";

export interface BackgroundWorkerJobsShape {
  readonly runDownloadSyncWorkerTask: () => Effect.Effect<
    void,
    DatabaseError | OperationsError | RuntimeConfigSnapshotError,
    RuntimeConfigSnapshotService
  >;
  readonly runLibraryScanWorkerTask: () => Effect.Effect<void, DatabaseError | OperationsError>;
  readonly runMetadataRefreshWorkerTask: () => Effect.Effect<
    void,
    DatabaseError | ExternalCallError | AnimeServiceError
  >;
  readonly runRssWorkerTask: () => Effect.Effect<
    void,
    | DatabaseError
    | ExternalCallError
    | OperationsError
    | AnimeServiceError
    | RuntimeConfigSnapshotError,
    RuntimeConfigSnapshotService
  >;
}

export class BackgroundWorkerJobs extends Context.Tag("@bakarr/api/BackgroundWorkerJobs")<
  BackgroundWorkerJobs,
  BackgroundWorkerJobsShape
>() {}

export const BackgroundWorkerJobsLive = Layer.effect(
  BackgroundWorkerJobs,
  Effect.gen(function* () {
    const downloadCommandService = yield* CatalogDownloadCommandService;
    const catalogLibraryScanService = yield* CatalogLibraryScanService;
    const animeMaintenanceService = yield* AnimeMaintenanceService;
    const backgroundSearchRssWorkerService = yield* BackgroundSearchRssWorkerService;

    const runRssWorkerTask = Effect.fn("Background.runRssWorkerTask")(function* () {
      yield* backgroundSearchRssWorkerService.runRssWorker();
    });

    const runDownloadSyncWorkerTask = Effect.fn("Background.runDownloadSyncWorkerTask")(
      function* () {
        yield* downloadCommandService.syncDownloads();
      },
    );

    const runLibraryScanWorkerTask = Effect.fn("Background.runLibraryScanWorkerTask")(function* () {
      yield* catalogLibraryScanService.runLibraryScan();
    });

    const runMetadataRefreshWorkerTask = Effect.fn("Background.runMetadataRefreshWorkerTask")(
      function* () {
        yield* animeMaintenanceService.refreshMetadataForMonitoredAnime().pipe(Effect.asVoid);
      },
    );

    return BackgroundWorkerJobs.of({
      runDownloadSyncWorkerTask,
      runLibraryScanWorkerTask,
      runMetadataRefreshWorkerTask,
      runRssWorkerTask,
    });
  }),
);
