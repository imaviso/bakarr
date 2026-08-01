import { Effect } from "effect";

import type { Download, DownloadEventsPage, DownloadStatus } from "@packages/shared/index.ts";
import type { DatabaseError } from "@/db/database.ts";
import {
  renderDownloadEventsExportCsv,
  renderDownloadEventsExportJson,
  type DownloadEventCsvExportStreamShape,
  type DownloadEventExportStreamShape,
} from "@/features/operations/catalog/catalog-download-event-render-support.ts";
import {
  DownloadRepository,
  type DownloadEventExportQuery,
  type DownloadEventListQuery,
} from "@/features/operations/repository/download-repository.ts";
import { StoredDataError } from "@/features/errors.ts";
import { OperationsProgress } from "@/features/operations/tasks/operations-progress-service.ts";
import { nowIso as currentNowIso } from "@/infra/time.ts";

type ReadError = DatabaseError | StoredDataError;

export type { DownloadEventExportQuery } from "@/features/operations/repository/download-repository.ts";
export type {
  DownloadEventCsvExportStreamShape,
  DownloadEventExportStreamShape,
} from "@/features/operations/catalog/catalog-download-event-render-support.ts";

export interface CatalogDownloadReadServiceShape {
  readonly listDownloadEvents: (
    input?: DownloadEventListQuery,
  ) => Effect.Effect<DownloadEventsPage, ReadError>;
  readonly listDownloadHistory: () => Effect.Effect<Download[], ReadError>;
  readonly listDownloadQueue: () => Effect.Effect<DownloadStatus[], ReadError>;
  readonly streamDownloadEventsExportJson: (
    input?: DownloadEventExportQuery,
  ) => Effect.Effect<DownloadEventExportStreamShape, ReadError>;
  readonly streamDownloadEventsExportCsv: (
    input?: DownloadEventExportQuery,
  ) => Effect.Effect<DownloadEventCsvExportStreamShape, ReadError>;
}

export class CatalogDownloadReadService extends Effect.Service<CatalogDownloadReadService>()(
  "@bakarr/api/CatalogDownloadReadService",
  {
    effect: Effect.gen(function* () {
      const downloadRepository = yield* DownloadRepository;
      const operationsProgress = yield* OperationsProgress;
      const nowIso = currentNowIso;

      const listDownloadEvents = Effect.fn("CatalogDownloadReadService.listDownloadEvents")(
        function* (input?: DownloadEventListQuery) {
          return yield* downloadRepository.listDownloadEvents(input);
        },
      );

      const listDownloadHistory = Effect.fn("CatalogDownloadReadService.listDownloadHistory")(
        function* () {
          const page = yield* downloadRepository.listDownloadHistory();
          return page.downloads;
        },
      );

      const listDownloadQueue = Effect.fn("CatalogDownloadReadService.listDownloadQueue")(
        function* () {
          return yield* operationsProgress.getDownloadProgress();
        },
      );

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
        listDownloadEvents,
        listDownloadHistory,
        listDownloadQueue,
        streamDownloadEventsExportCsv,
        streamDownloadEventsExportJson,
      } satisfies CatalogDownloadReadServiceShape;
    }),
    // OperationsProgress is a stateful singleton provided once by the lifecycle
    // layer — embedding it here would build a second instance (different layer object).
    dependencies: [DownloadRepository.Default],
  },
) {}

export const CatalogDownloadReadServiceLive = CatalogDownloadReadService.Default;
