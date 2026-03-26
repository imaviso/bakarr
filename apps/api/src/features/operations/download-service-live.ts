import { Effect, Layer } from "effect";

import {
  CatalogOrchestration,
  DownloadOrchestration,
  SearchOrchestration,
} from "./operations-orchestration.ts";
import {
  DownloadControlService,
  DownloadStatusService,
  DownloadTriggerService,
  type DownloadControlServiceShape,
  type DownloadStatusServiceShape,
  type DownloadTriggerServiceShape,
} from "./service-contract.ts";

export const DownloadStatusServiceLive = Layer.effect(
  DownloadStatusService,
  Effect.gen(function* () {
    const catalog = yield* CatalogOrchestration;

    return {
      exportDownloadEvents: catalog.exportDownloadEvents,
      getDownloadProgress: catalog.getDownloadProgress,
      listDownloadEvents: catalog.listDownloadEvents,
      listDownloadHistory: catalog.listDownloadHistory,
      listDownloadQueue: catalog.listDownloadQueue,
    } satisfies DownloadStatusServiceShape;
  }),
);

export const DownloadTriggerServiceLive = Layer.effect(
  DownloadTriggerService,
  Effect.gen(function* () {
    const search = yield* SearchOrchestration;
    const download = yield* DownloadOrchestration;

    return {
      triggerDownload: download.triggerDownload,
      triggerSearchMissing: search.triggerSearchMissing,
    } satisfies DownloadTriggerServiceShape;
  }),
);

export const DownloadControlServiceLive = Layer.effect(
  DownloadControlService,
  Effect.gen(function* () {
    const catalog = yield* CatalogOrchestration;

    return {
      pauseDownload: catalog.pauseDownload,
      reconcileDownload: catalog.reconcileDownload,
      removeDownload: catalog.removeDownload,
      resumeDownload: catalog.resumeDownload,
      retryDownload: catalog.retryDownload,
      syncDownloads: catalog.syncDownloads,
    } satisfies DownloadControlServiceShape;
  }),
);
