import { Effect, Layer } from "effect";

import {
  CatalogOrchestration,
  DownloadOrchestration,
  SearchOrchestration,
} from "./operations-orchestration.ts";
import { DownloadService, type DownloadServiceShape } from "./service-contract.ts";

export const DownloadServiceLive = Layer.effect(
  DownloadService,
  Effect.gen(function* () {
    const catalog = yield* CatalogOrchestration;
    const search = yield* SearchOrchestration;
    const download = yield* DownloadOrchestration;

    return {
      exportDownloadEvents: catalog.exportDownloadEvents,
      getDownloadProgress: catalog.getDownloadProgress,
      listDownloadEvents: catalog.listDownloadEvents,
      listDownloadHistory: catalog.listDownloadHistory,
      listDownloadQueue: catalog.listDownloadQueue,
      pauseDownload: catalog.pauseDownload,
      reconcileDownload: catalog.reconcileDownload,
      removeDownload: catalog.removeDownload,
      resumeDownload: catalog.resumeDownload,
      retryDownload: catalog.retryDownload,
      syncDownloads: catalog.syncDownloads,
      triggerDownload: download.triggerDownload,
      triggerSearchMissing: search.triggerSearchMissing,
    } satisfies DownloadServiceShape;
  }),
);
