import { Effect } from "effect";

import type {
  DownloadEventsPage,
  DownloadHistoryPage,
  DownloadStatus,
} from "@packages/shared/index.ts";
import { AppDrizzleDatabase, type DatabaseError } from "@/db/database.ts";
import {
  makeCatalogDownloadEventReads,
  type DownloadEventCsvExportStreamShape,
  type DownloadEventExportQuery,
  type DownloadEventExportStreamShape,
} from "@/features/operations/catalog/catalog-download-event-read-support.ts";
import { makeCatalogDownloadListReads } from "@/features/operations/catalog/catalog-download-list-read-support.ts";
import {
  makeCatalogDownloadProgressReads,
  type DownloadRuntimeSummary,
} from "@/features/operations/catalog/catalog-download-progress-read-support.ts";
import { StoredDataError } from "@/features/errors.ts";
import { nowIso as currentNowIso } from "@/infra/time.ts";
import { tryDatabasePromise } from "@/infra/effect/db.ts";

type ReadError = DatabaseError | StoredDataError;

export interface CatalogDownloadReadServiceShape {
  readonly listDownloadQueue: () => Effect.Effect<DownloadStatus[], ReadError>;
  readonly listDownloadHistory: (input?: {
    readonly cursor?: string;
    readonly limit?: number;
  }) => Effect.Effect<DownloadHistoryPage, ReadError>;
  readonly listDownloadEvents: (input?: {
    readonly mediaId?: number;
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
    readonly mediaId?: number;
    readonly downloadId?: number;
    readonly endDate?: string;
    readonly eventType?: string;
    readonly limit?: number;
    readonly order?: "asc" | "desc";
    readonly startDate?: string;
    readonly status?: string;
  }) => Effect.Effect<DownloadEventExportStreamShape, ReadError>;
  readonly streamDownloadEventsExportCsv: (input?: {
    readonly mediaId?: number;
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

export class CatalogDownloadReadService extends Effect.Service<CatalogDownloadReadService>()(
  "@bakarr/api/CatalogDownloadReadService",
  {
    effect: Effect.gen(function* () {
      const db = yield* AppDrizzleDatabase;
      const nowIso = currentNowIso;

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

      return {
        getDownloadProgress: progressReads.getDownloadProgress,
        getDownloadProgressBootstrap: progressReads.getDownloadProgressBootstrap,
        getDownloadRuntimeSummary: progressReads.getDownloadRuntimeSummary,
        listDownloadEvents: eventReads.listDownloadEvents,
        listDownloadHistory: listReads.listDownloadHistory,
        listDownloadQueue: progressReads.getDownloadProgress,
        streamDownloadEventsExportCsv,
        streamDownloadEventsExportJson,
      } satisfies CatalogDownloadReadServiceShape;
    }),
    dependencies: [AppDrizzleDatabase.Default],
  },
) {}

export const CatalogDownloadReadServiceLive = CatalogDownloadReadService.Default;
