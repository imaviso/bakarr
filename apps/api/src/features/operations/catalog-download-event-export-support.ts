import { and, asc, desc, gt, lt, sql, type SQL } from "drizzle-orm";
import { Chunk, Effect, Option, Schema, Stream } from "effect";

import type { DownloadEvent } from "@packages/shared/index.ts";
import type { AppDatabase, DatabaseError } from "@/db/database.ts";
import { downloadEvents } from "@/db/schema.ts";
import {
  loadDownloadEventPresentationContexts,
  toDownloadEvent,
} from "@/lib/download-event-presentations.ts";
import type { TryDatabasePromise } from "@/lib/effect-db.ts";
import type { OperationsStoredDataError } from "@/features/operations/errors.ts";

export interface DownloadEventExportHeader {
  readonly exported: number;
  readonly generated_at: string;
  readonly limit: number;
  readonly order: "asc" | "desc";
  readonly total: number;
  readonly truncated: boolean;
}

export interface DownloadEventExportQuery {
  readonly animeId?: number;
  readonly downloadId?: number;
  readonly endDate?: string;
  readonly eventType?: string;
  readonly limit?: number;
  readonly order?: "asc" | "desc";
  readonly startDate?: string;
  readonly status?: string;
}

export interface DownloadEventExportStreamShape {
  readonly header: DownloadEventExportHeader;
  readonly stream: Stream.Stream<Uint8Array, DatabaseError | OperationsStoredDataError>;
}

export interface DownloadEventCsvExportStreamShape {
  readonly header: DownloadEventExportHeader;
  readonly stream: Stream.Stream<Uint8Array, DatabaseError | OperationsStoredDataError>;
}

interface DownloadEventExportPlan {
  readonly baseConditions: readonly SQL[];
  readonly limit: number;
  readonly order: "asc" | "desc";
}

const textEncoder = new TextEncoder();
const DownloadEventExportHeaderJsonSchema = Schema.parseJson(
  Schema.Struct({
    exported: Schema.Number,
    generated_at: Schema.String,
    limit: Schema.Number,
    order: Schema.Literal("asc", "desc"),
    total: Schema.Number,
    truncated: Schema.Boolean,
  }),
);

const buildDownloadEventExportPlan = (
  queryInput: DownloadEventExportQuery,
  buildConditions: (queryInput: DownloadEventExportQuery) => readonly SQL[],
): DownloadEventExportPlan => ({
  baseConditions: buildConditions(queryInput),
  limit: Math.max(1, Math.min(queryInput.limit ?? 10_000, 50_000)),
  order: queryInput.order === "asc" ? "asc" : "desc",
});

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
    const metadata = yield* loadDownloadEventExportMetadata(db, tryDatabasePromise, plan, nowIso);
    const header = {
      exported: metadata.exported,
      generated_at: metadata.generated_at,
      limit: metadata.limit,
      order: metadata.order,
      total: metadata.total,
      truncated: metadata.truncated,
    } satisfies DownloadEventExportHeader;
    const suffixMetadata = yield* Schema.encode(DownloadEventExportHeaderJsonSchema)(header).pipe(
      Effect.orDie,
    );
    const objectPrefix = textEncoder.encode('{"events":[');
    const objectSuffix = textEncoder.encode(`],${suffixMetadata.slice(1)}`);

    const eventStream = streamDownloadEvents(db, tryDatabasePromise, plan).pipe(
      Stream.zipWithIndex,
      Stream.map(([event, index]) =>
        textEncoder.encode(`${index === 0 ? "" : ","}${JSON.stringify(event)}`),
      ),
    );

    const stream = Stream.concat(
      Stream.fromIterable([objectPrefix]),
      Stream.concat(eventStream, Stream.fromIterable([objectSuffix])),
    );

    return {
      header,
      stream,
    } satisfies DownloadEventExportStreamShape;
  });

  const streamDownloadEventsExportCsv = Effect.fn(
    "OperationsService.streamDownloadEventsExportCsv",
  )(function* (queryInput: DownloadEventExportQuery = {}) {
    const plan = buildDownloadEventExportPlan(queryInput, buildConditions);
    const metadata = yield* loadDownloadEventExportMetadata(db, tryDatabasePromise, plan, nowIso);
    const csvHeader = textEncoder.encode(
      "id,created_at,event_type,from_status,to_status,anime_id,anime_title,download_id,torrent_name,message,metadata,metadata_json\n",
    );
    const csvRows = streamDownloadEvents(db, tryDatabasePromise, plan).pipe(
      Stream.map((event) =>
        textEncoder.encode(
          [
            String(event.id),
            event.created_at,
            escapeCsv(event.event_type),
            escapeCsv(event.from_status ?? ""),
            escapeCsv(event.to_status ?? ""),
            event.anime_id === undefined ? "" : String(event.anime_id),
            escapeCsv(event.anime_title ?? ""),
            event.download_id === undefined ? "" : String(event.download_id),
            escapeCsv(event.torrent_name ?? ""),
            escapeCsv(event.message),
            escapeCsv(event.metadata ?? ""),
            escapeCsv(event.metadata_json ? JSON.stringify(event.metadata_json) : ""),
          ].join(",") + "\n",
        ),
      ),
    );

    return {
      header: {
        exported: metadata.exported,
        generated_at: metadata.generated_at,
        limit: metadata.limit,
        order: metadata.order,
        total: metadata.total,
        truncated: metadata.truncated,
      },
      stream: Stream.concat(Stream.fromIterable([csvHeader]), csvRows),
    } satisfies DownloadEventCsvExportStreamShape;
  });

  return {
    streamDownloadEventsExportCsv,
    streamDownloadEventsExportJson,
  } as const;
}

const loadDownloadEventExportMetadata = Effect.fn(
  "OperationsService.loadDownloadEventExportMetadata",
)(function* (
  db: AppDatabase,
  tryDatabasePromise: TryDatabasePromise,
  plan: DownloadEventExportPlan,
  nowIso: () => Effect.Effect<string>,
) {
  const totalRows = yield* tryDatabasePromise("Failed to count download events", () => {
    const totalQuery = db.select({ count: sql<number>`count(*)` }).from(downloadEvents);
    return plan.baseConditions.length > 0
      ? totalQuery.where(and(...plan.baseConditions))
      : totalQuery;
  });
  const total = Number(totalRows[0]?.count ?? 0);
  const generated_at = yield* nowIso();

  return {
    exported: Math.min(total, plan.limit),
    generated_at,
    limit: plan.limit,
    order: plan.order,
    total,
    truncated: total > plan.limit,
  } satisfies DownloadEventExportHeader;
});

function streamDownloadEvents(
  db: AppDatabase,
  tryDatabasePromise: TryDatabasePromise,
  plan: DownloadEventExportPlan,
): Stream.Stream<DownloadEvent, DatabaseError | OperationsStoredDataError> {
  const pageSize = 500;

  return Stream.unfoldChunkEffect(
    { emitted: 0, cursor: undefined as number | undefined },
    (state) =>
      Effect.gen(function* () {
        const remaining = plan.limit - state.emitted;
        if (remaining <= 0) {
          return Option.none<readonly [Chunk.Chunk<DownloadEvent>, typeof state]>();
        }

        let cursorCondition: SQL | undefined;

        if (state.cursor !== undefined) {
          cursorCondition =
            plan.order === "asc"
              ? gt(downloadEvents.id, state.cursor)
              : lt(downloadEvents.id, state.cursor);
        }
        const conditions = cursorCondition
          ? [...plan.baseConditions, cursorCondition]
          : [...plan.baseConditions];

        const rows = yield* tryDatabasePromise("Failed to stream download events", () => {
          const query = db
            .select()
            .from(downloadEvents)
            .orderBy(plan.order === "asc" ? asc(downloadEvents.id) : desc(downloadEvents.id))
            .limit(Math.min(pageSize, remaining));

          return conditions.length > 0 ? query.where(and(...conditions)) : query;
        });

        if (rows.length === 0) {
          return Option.none<readonly [Chunk.Chunk<DownloadEvent>, typeof state]>();
        }

        const contexts = yield* loadDownloadEventPresentationContexts(db, rows);
        const events = yield* Effect.forEach(rows, (row) =>
          toDownloadEvent(row, contexts.get(row.id)),
        );
        const lastId = rows[rows.length - 1]?.id;

        return Option.some([
          Chunk.fromIterable(events),
          {
            emitted: state.emitted + events.length,
            cursor: lastId,
          },
        ] as const);
      }),
  );
}

function escapeCsv(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }

  return value;
}
