import { Effect } from "effect";

import type {
  DownloadEventsPage,
  DownloadHistoryPage,
  DownloadStatus,
} from "@packages/shared/index.ts";
import type { DatabaseError } from "@/db/database.ts";
import {
  renderDownloadEventsExportCsv,
  renderDownloadEventsExportJson,
  type DownloadEventCsvExportStreamShape,
  type DownloadEventExportStreamShape,
} from "@/features/operations/catalog/catalog-download-event-render-support.ts";
import { loadActiveDownloadSnapshot } from "@/features/operations/download/download-progress-support.ts";
import {
  DownloadRepository,
  type DownloadEventExportQuery,
} from "@/features/operations/repository/download-repository-service.ts";
import { StoredDataError } from "@/features/errors.ts";
import { nowIso as currentNowIso } from "@/infra/time.ts";

type ReadError = DatabaseError | StoredDataError;

export interface DownloadRuntimeSummary {
  readonly active_count: number;
}

export type { DownloadEventExportQuery } from "@/features/operations/repository/download-repository-service.ts";
export type {
  DownloadEventCsvExportStreamShape,
  DownloadEventExportStreamShape,
} from "@/features/operations/catalog/catalog-download-event-render-support.ts";

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
  readonly streamDownloadEventsExportJson: (
    input?: DownloadEventExportQuery,
  ) => Effect.Effect<DownloadEventExportStreamShape, ReadError>;
  readonly streamDownloadEventsExportCsv: (
    input?: DownloadEventExportQuery,
  ) => Effect.Effect<DownloadEventCsvExportStreamShape, ReadError>;
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
      const downloadRepository = yield* DownloadRepository;
      const nowIso = currentNowIso;

      const getDownloadProgress = Effect.fn("CatalogDownloadReadService.getDownloadProgress")(
        function* () {
          return yield* loadActiveDownloadSnapshot({
            listRows: () => downloadRepository.listActiveDownloadRows(),
            loadContexts: (rows) => downloadRepository.loadPresentationContexts(rows),
          });
        },
      );

      const getDownloadProgressBootstrap = Effect.fn(
        "CatalogDownloadReadService.getDownloadProgressBootstrap",
      )(function* (input: { limit?: number } = {}) {
        const limit = Math.max(1, Math.min(input.limit ?? 200, 500));
        return yield* loadActiveDownloadSnapshot({
          listRows: () => downloadRepository.listActiveDownloadRows(limit),
          loadContexts: (rows) => downloadRepository.loadPresentationContexts(rows),
        });
      });

      const getDownloadRuntimeSummary = Effect.fn(
        "CatalogDownloadReadService.getDownloadRuntimeSummary",
      )(function* () {
        return {
          active_count: yield* downloadRepository.countActiveDownloads(),
        } satisfies DownloadRuntimeSummary;
      });

      const streamDownloadEventsExportJson = Effect.fn(
        "CatalogDownloadReadService.streamDownloadEventsExportJson",
      )(function* (input: DownloadEventExportQuery = {}) {
        const generatedAt = yield* nowIso();
        const header = yield* downloadRepository.loadDownloadEventExportHeader(input, generatedAt);
        return {
          header,
          stream: renderDownloadEventsExportJson(
            downloadRepository.streamDownloadEvents(input),
            header,
          ),
        } satisfies DownloadEventExportStreamShape;
      });

      const streamDownloadEventsExportCsv = Effect.fn(
        "CatalogDownloadReadService.streamDownloadEventsExportCsv",
      )(function* (input: DownloadEventExportQuery = {}) {
        const generatedAt = yield* nowIso();
        const header = yield* downloadRepository.loadDownloadEventExportHeader(input, generatedAt);
        return {
          header,
          stream: renderDownloadEventsExportCsv(downloadRepository.streamDownloadEvents(input)),
        } satisfies DownloadEventCsvExportStreamShape;
      });

      return {
        getDownloadProgress,
        getDownloadProgressBootstrap,
        getDownloadRuntimeSummary,
        listDownloadEvents: downloadRepository.listDownloadEvents,
        listDownloadHistory: downloadRepository.listDownloadHistory,
        listDownloadQueue: getDownloadProgress,
        streamDownloadEventsExportCsv,
        streamDownloadEventsExportJson,
      } satisfies CatalogDownloadReadServiceShape;
    }),
    dependencies: [DownloadRepository.Default],
  },
) {}

export const CatalogDownloadReadServiceLive = CatalogDownloadReadService.Default;
