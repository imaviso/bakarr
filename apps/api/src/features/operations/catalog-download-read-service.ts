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
import { makeCatalogDownloadListReads } from "@/features/operations/catalog-download-list-read-support.ts";
import {
  makeCatalogDownloadProgressReads,
  type DownloadRuntimeSummary,
} from "@/features/operations/catalog-download-progress-read-support.ts";
import { OperationsStoredDataError } from "@/features/operations/errors.ts";
import { ClockService, nowIsoFromClock } from "@/lib/clock.ts";
import { tryDatabasePromise } from "@/lib/effect-db.ts";

type ReadError = DatabaseError | OperationsStoredDataError;

export interface CatalogDownloadReadServiceShape {
  readonly listDownloadQueue: () => Effect.Effect<Download[], ReadError>;
  readonly listDownloadHistory: (input?: {
    readonly cursor?: string;
    readonly limit?: number;
  }) => Effect.Effect<DownloadHistoryPage, ReadError>;
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
  }) => Effect.Effect<DownloadEventsPage, ReadError>;
  readonly streamDownloadEventsExportJson: (input?: {
    readonly animeId?: number;
    readonly downloadId?: number;
    readonly endDate?: string;
    readonly eventType?: string;
    readonly limit?: number;
    readonly order?: "asc" | "desc";
    readonly startDate?: string;
    readonly status?: string;
  }) => Effect.Effect<DownloadEventExportStreamShape, ReadError>;
  readonly streamDownloadEventsExportCsv: (input?: {
    readonly animeId?: number;
    readonly downloadId?: number;
    readonly endDate?: string;
    readonly eventType?: string;
    readonly limit?: number;
    readonly order?: "asc" | "desc";
    readonly startDate?: string;
    readonly status?: string;
  }) => Effect.Effect<DownloadEventCsvExportStreamShape, ReadError>;
  readonly getDownloadProgress: () => Effect.Effect<DownloadStatus[], ReadError>;
  readonly getDownloadProgressBootstrap: (input?: {
    readonly limit?: number;
  }) => Effect.Effect<DownloadStatus[], ReadError>;
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
