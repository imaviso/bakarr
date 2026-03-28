import { Context, Effect, Layer } from "effect";

import type { DownloadStatus } from "../../../../../packages/shared/src/index.ts";
import type { DatabaseError } from "../../db/database.ts";
import {
  CatalogDownloadControlService,
  CatalogLibraryService,
  CatalogReadService,
} from "./catalog-service-tags.ts";
import { makeSearchWorkflow } from "./search-service-tags.ts";
import type { OperationsError } from "./errors.ts";
import type { OperationsStoredDataError } from "./errors.ts";

export interface DownloadLifecycleServiceShape {
  readonly getDownloadProgress: () => Effect.Effect<
    DownloadStatus[],
    DatabaseError | OperationsStoredDataError
  >;
  readonly syncDownloads: () => Effect.Effect<void, DatabaseError>;
}

export class DownloadLifecycleService extends Context.Tag("@bakarr/api/DownloadLifecycleService")<
  DownloadLifecycleService,
  DownloadLifecycleServiceShape
>() {}

export const DownloadLifecycleServiceLive = Layer.effect(
  DownloadLifecycleService,
  Effect.gen(function* () {
    const catalogRead = yield* CatalogReadService;
    const catalogControl = yield* CatalogDownloadControlService;

    return {
      getDownloadProgress: catalogRead.getDownloadProgress,
      syncDownloads: catalogControl.syncDownloads,
    };
  }),
);

export interface SearchWorkerServiceShape {
  readonly runRssCheck: () => Effect.Effect<{ newItems: number }, DatabaseError>;
  readonly triggerSearchMissing: (animeId?: number) => Effect.Effect<void, DatabaseError>;
}

export class SearchWorkerService extends Context.Tag("@bakarr/api/SearchWorkerService")<
  SearchWorkerService,
  SearchWorkerServiceShape
>() {}

export const SearchWorkerServiceLive = Layer.effect(
  SearchWorkerService,
  Effect.gen(function* () {
    const search = yield* makeSearchWorkflow;

    return {
      runRssCheck: search.runRssCheck,
      triggerSearchMissing: search.triggerSearchMissing,
    };
  }),
);

export interface LibraryScanServiceShape {
  readonly runLibraryScan: () => Effect.Effect<
    { matched: number; scanned: number },
    DatabaseError | OperationsError
  >;
}

export class LibraryScanService extends Context.Tag("@bakarr/api/LibraryScanService")<
  LibraryScanService,
  LibraryScanServiceShape
>() {}

export const LibraryScanServiceLive = Layer.effect(
  LibraryScanService,
  Effect.gen(function* () {
    const catalog = yield* CatalogLibraryService;

    return {
      runLibraryScan: catalog.runLibraryScan,
    };
  }),
);
