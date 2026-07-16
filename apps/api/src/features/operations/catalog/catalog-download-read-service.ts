import { Effect } from "effect";

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
} from "@/features/operations/repository/download-repository.ts";
import { StoredDataError } from "@/features/errors.ts";
import { nowIso as currentNowIso } from "@/infra/time.ts";

type ReadError = DatabaseError | StoredDataError;

export type { DownloadEventExportQuery } from "@/features/operations/repository/download-repository.ts";
export type {
  DownloadEventCsvExportStreamShape,
  DownloadEventExportStreamShape,
} from "@/features/operations/catalog/catalog-download-event-render-support.ts";

/** Export streams only — list/history/progress live on DownloadRepository / OperationsProgress. */
export interface CatalogDownloadReadServiceShape {
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
      const nowIso = currentNowIso;

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
        streamDownloadEventsExportCsv,
        streamDownloadEventsExportJson,
      } satisfies CatalogDownloadReadServiceShape;
    }),
    dependencies: [DownloadRepository.Default],
  },
) {}

export const CatalogDownloadReadServiceLive = CatalogDownloadReadService.Default;
