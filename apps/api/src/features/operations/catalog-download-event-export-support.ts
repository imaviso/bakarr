import type { SQL } from "drizzle-orm";
import { Effect } from "effect";

import type { AppDatabase } from "@/db/database.ts";
import {
  renderDownloadEventsExportCsv,
  renderDownloadEventsExportJson,
  type DownloadEventCsvExportStreamShape,
  type DownloadEventExportStreamShape,
} from "@/features/operations/catalog-download-event-render-support.ts";
import {
  buildDownloadEventExportPlan,
  loadDownloadEventExportMetadata,
  streamDownloadEvents,
  type DownloadEventExportHeader,
  type DownloadEventExportQuery,
} from "@/features/operations/catalog-download-event-stream-support.ts";
import type { TryDatabasePromise } from "@/lib/effect-db.ts";

export type {
  DownloadEventCsvExportStreamShape,
  DownloadEventExportHeader,
  DownloadEventExportQuery,
  DownloadEventExportStreamShape,
};

export function makeCatalogDownloadEventExportSupport(input: {
  readonly buildConditions: (queryInput: DownloadEventExportQuery) => readonly SQL[];
  readonly db: AppDatabase;
  readonly nowIso: () => Effect.Effect<string>;
  readonly tryDatabasePromise: TryDatabasePromise;
}) {
  const { buildConditions, db, nowIso, tryDatabasePromise } = input;

  const streamDownloadEventsExportJson = Effect.fn(
    "OperationsService.streamDownloadEventsExportJson",
  )(function* (queryInput: DownloadEventExportQuery = {}) {
    const plan = buildDownloadEventExportPlan(queryInput, buildConditions);
    const header = yield* loadDownloadEventExportMetadata(db, tryDatabasePromise, plan, nowIso);
    const eventStream = streamDownloadEvents({
      db,
      plan,
      tryDatabasePromise,
    });

    return {
      header,
      stream: renderDownloadEventsExportJson(eventStream, header),
    } satisfies DownloadEventExportStreamShape;
  });

  const streamDownloadEventsExportCsv = Effect.fn(
    "OperationsService.streamDownloadEventsExportCsv",
  )(function* (queryInput: DownloadEventExportQuery = {}) {
    const plan = buildDownloadEventExportPlan(queryInput, buildConditions);
    const header = yield* loadDownloadEventExportMetadata(db, tryDatabasePromise, plan, nowIso);
    const eventStream = streamDownloadEvents({
      db,
      plan,
      tryDatabasePromise,
    });

    return {
      header,
      stream: renderDownloadEventsExportCsv(eventStream),
    } satisfies DownloadEventCsvExportStreamShape;
  });

  return {
    streamDownloadEventsExportCsv,
    streamDownloadEventsExportJson,
  } as const;
}
