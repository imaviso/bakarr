import { Context, Effect, Layer } from "effect";

import { Database } from "@/db/database.ts";
import { ClockService, nowIsoFromClock } from "@/lib/clock.ts";
import {
  makeCatalogDownloadViewSupport,
  type CatalogDownloadViewSupportShape,
} from "@/features/operations/catalog-download-view-support.ts";
import { tryDatabasePromise } from "@/lib/effect-db.ts";

export type CatalogDownloadReadServiceShape = Pick<
  CatalogDownloadViewSupportShape,
  | "exportDownloadEvents"
  | "getDownloadProgress"
  | "listDownloadEvents"
  | "listDownloadHistory"
  | "listDownloadQueue"
  | "streamDownloadEventsExportCsv"
  | "streamDownloadEventsExportJson"
>;

export class CatalogDownloadReadService extends Context.Tag(
  "@bakarr/api/CatalogDownloadReadService",
)<CatalogDownloadReadService, CatalogDownloadReadServiceShape>() {}

export const CatalogDownloadReadServiceLive = Layer.effect(
  CatalogDownloadReadService,
  Effect.gen(function* () {
    const { db } = yield* Database;
    const clock = yield* ClockService;
    const support = makeCatalogDownloadViewSupport({
      db,
      nowIso: () => nowIsoFromClock(clock),
      tryDatabasePromise,
    });

    return CatalogDownloadReadService.of({
      exportDownloadEvents: support.exportDownloadEvents,
      getDownloadProgress: support.getDownloadProgress,
      listDownloadEvents: support.listDownloadEvents,
      listDownloadHistory: support.listDownloadHistory,
      listDownloadQueue: support.listDownloadQueue,
      streamDownloadEventsExportCsv: support.streamDownloadEventsExportCsv,
      streamDownloadEventsExportJson: support.streamDownloadEventsExportJson,
    });
  }),
);
