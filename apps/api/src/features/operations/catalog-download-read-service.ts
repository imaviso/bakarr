import { Context, Effect, Layer } from "effect";

import type {
  Download,
  DownloadEventsPage,
  DownloadHistoryPage,
  DownloadStatus,
} from "@packages/shared/index.ts";
import { Database, type DatabaseError } from "@/db/database.ts";
import {
  makeCatalogDownloadEventReads,
  type DownloadEventCsvExportStreamShape,
  type DownloadEventExportQuery,
  type DownloadEventExportStreamShape,
} from "@/features/operations/catalog-download-event-read-support.ts";
import {
  makeCatalogDownloadListReads,
} from "@/features/operations/catalog-download-list-read-support.ts";
import {
  makeCatalogDownloadProgressReads,
  type DownloadRuntimeSummary,
} from "@/features/operations/catalog-download-progress-read-support.ts";
import { ClockService, nowIsoFromClock } from "@/lib/clock.ts";
import { tryDatabasePromise } from "@/lib/effect-db.ts";

export interface CatalogDownloadReadServiceShape {
  readonly listDownloadQueue: () => Effect.Effect<
    Download[],
    DatabaseError | import("./errors.ts").OperationsStoredDataError
  >;
  readonly listDownloadHistory: (input?: {
    readonly cursor?: string;
    readonly limit?: number;
  }) => Effect.Effect<
    DownloadHistoryPage,
    DatabaseError | import("./errors.ts").OperationsStoredDataError
  >;
  readonly listDownloadEvents: (input?: {
    readonly animeId?: number;
    readonly cursor?: string;
    readonly downloadId?: number;
    readonly direction?: "next" | "prev";
    readonly endDate?: string;
    readonly eventType?: string;
    readonly limit?: number;
    readonly startDate?: string;
    readonly status?: string;
  }) => Effect.Effect<
    DownloadEventsPage,
    DatabaseError | import("./errors.ts").OperationsStoredDataError
  >;
  readonly streamDownloadEventsExportJson: (input?: {
    readonly animeId?: number;
    readonly downloadId?: number;
    readonly endDate?: string;
    readonly eventType?: string;
    readonly limit?: number;
    readonly order?: "asc" | "desc";
    readonly startDate?: string;
    readonly status?: string;
  }) => Effect.Effect<
    DownloadEventExportStreamShape,
    DatabaseError | import("./errors.ts").OperationsStoredDataError
  >;
  readonly streamDownloadEventsExportCsv: (input?: {
    readonly animeId?: number;
    readonly downloadId?: number;
    readonly endDate?: string;
    readonly eventType?: string;
    readonly limit?: number;
    readonly order?: "asc" | "desc";
    readonly startDate?: string;
    readonly status?: string;
  }) => Effect.Effect<
    DownloadEventCsvExportStreamShape,
    DatabaseError | import("./errors.ts").OperationsStoredDataError
  >;
  readonly getDownloadProgress: () => Effect.Effect<
    DownloadStatus[],
    DatabaseError | import("./errors.ts").OperationsStoredDataError
  >;
  readonly getDownloadProgressBootstrap: (input?: {
    readonly limit?: number;
  }) => Effect.Effect<
    DownloadStatus[],
    DatabaseError | import("./errors.ts").OperationsStoredDataError
  >;
  readonly getDownloadRuntimeSummary: () => Effect.Effect<DownloadRuntimeSummary, DatabaseError>;
}

export class CatalogDownloadReadService extends Context.Tag(
  "@bakarr/api/CatalogDownloadReadService",
)<CatalogDownloadReadService, CatalogDownloadReadServiceShape>() {}

export const CatalogDownloadReadServiceLive = Layer.effect(
  CatalogDownloadReadService,
  Effect.gen(function* () {
    const { db } = yield* Database;
    const clock = yield* ClockService;
    const nowIso = () => nowIsoFromClock(clock);

    const listReads = makeCatalogDownloadListReads({ db, tryDatabasePromise });
    const eventReads = makeCatalogDownloadEventReads({ db, nowIso, tryDatabasePromise });
    const progressReads = makeCatalogDownloadProgressReads({ db, tryDatabasePromise });

    const streamDownloadEventsExportJson = Effect.fn(
      "OperationsService.streamDownloadEventsExportJson",
    )(function* (input: DownloadEventExportQuery = {}) {
      return yield* eventReads.streamDownloadEventsExportJson(input);
    });

    const streamDownloadEventsExportCsv = Effect.fn(
      "OperationsService.streamDownloadEventsExportCsv",
    )(function* (input: DownloadEventExportQuery = {}) {
      return yield* eventReads.streamDownloadEventsExportCsv(input);
    });

    return CatalogDownloadReadService.of({
      getDownloadProgress: progressReads.getDownloadProgress,
      getDownloadProgressBootstrap: progressReads.getDownloadProgressBootstrap,
      getDownloadRuntimeSummary: progressReads.getDownloadRuntimeSummary,
      listDownloadEvents: eventReads.listDownloadEvents,
      listDownloadHistory: listReads.listDownloadHistory,
      listDownloadQueue: listReads.listDownloadQueue,
      streamDownloadEventsExportCsv,
      streamDownloadEventsExportJson,
    });
  }),
);
