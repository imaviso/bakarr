import { Context, Effect, Layer } from "effect";

import type { DatabaseError } from "@/db/database.ts";
import { AnimeMaintenanceService } from "@/features/anime/anime-maintenance-service.ts";
import type { AnimeServiceError } from "@/features/anime/errors.ts";
import { EventBus } from "@/features/events/event-bus.ts";
import { CatalogDownloadService } from "@/features/operations/catalog-download-orchestration.ts";
import { CatalogLibraryScanService } from "@/features/operations/catalog-library-scan-support.ts";
import type { OperationsError } from "@/features/operations/errors.ts";
import { SearchBackgroundMissingService } from "@/features/operations/background-search-missing-support.ts";
import { SearchBackgroundRssService } from "@/features/operations/background-search-rss-support.ts";
import type { ExternalCallError } from "@/lib/effect-retry.ts";

export interface BackgroundWorkerJobsShape {
  readonly runDownloadSyncWorkerTask: () => Effect.Effect<void, DatabaseError | OperationsError>;
  readonly runLibraryScanWorkerTask: () => Effect.Effect<void, DatabaseError | OperationsError>;
  readonly runMetadataRefreshWorkerTask: () => Effect.Effect<
    void,
    DatabaseError | ExternalCallError | AnimeServiceError
  >;
  readonly runRssWorkerTask: () => Effect.Effect<void, DatabaseError | OperationsError>;
}

export class BackgroundWorkerJobs extends Context.Tag("@bakarr/api/BackgroundWorkerJobs")<
  BackgroundWorkerJobs,
  BackgroundWorkerJobsShape
>() {}

export const BackgroundWorkerJobsLive = Layer.effect(
  BackgroundWorkerJobs,
  Effect.gen(function* () {
    const eventBus = yield* EventBus;
    const catalogDownloadService = yield* CatalogDownloadService;
    const catalogLibraryScanService = yield* CatalogLibraryScanService;
    const animeMaintenanceService = yield* AnimeMaintenanceService;
    const searchBackgroundMissingService = yield* SearchBackgroundMissingService;
    const searchBackgroundRssService = yield* SearchBackgroundRssService;

    const runRssWorkerTask = Effect.fn("Background.runRssWorkerTask")(function* () {
      yield* searchBackgroundRssService.runRssCheck();
      yield* searchBackgroundMissingService.triggerSearchMissing();
    });

    const runDownloadSyncWorkerTask = Effect.fn("Background.runDownloadSyncWorkerTask")(
      function* () {
        yield* catalogDownloadService.syncDownloads();
        const downloads = yield* catalogDownloadService.getDownloadProgress();
        yield* eventBus.publish({
          type: "DownloadProgress",
          payload: { downloads },
        });
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
