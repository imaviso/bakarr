import { and, asc, desc, gt, lt, sql, type SQL } from "drizzle-orm";
import { Chunk, Effect, Option, Stream } from "effect";

import type { DownloadEvent } from "@packages/shared/index.ts";
import type { AppDatabase, DatabaseError } from "@/db/database.ts";
import { downloadEvents } from "@/db/schema.ts";
import {
  loadDownloadEventPresentationContexts,
  toDownloadEvent,
} from "@/domain/download/event-presentations.ts";
import type { TryDatabasePromise } from "@/infra/effect/db.ts";
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
  readonly mediaId?: number;
  readonly downloadId?: number;
  readonly endDate?: string;
  readonly eventType?: string;
  readonly limit?: number;
  readonly order?: "asc" | "desc";
  readonly startDate?: string;
  readonly status?: string;
}

interface DownloadEventExportPlan {
  readonly baseConditions: readonly SQL[];
  readonly limit: number;
  readonly order: "asc" | "desc";
}

export function buildDownloadEventExportPlan(
  queryInput: DownloadEventExportQuery,
  buildConditions: (queryInput: DownloadEventExportQuery) => readonly SQL[],
): DownloadEventExportPlan {
  return {
    baseConditions: buildConditions(queryInput),
    limit: Math.max(1, Math.min(queryInput.limit ?? 10_000, 50_000)),
    order: queryInput.order === "asc" ? "asc" : "desc",
  };
}

export const loadDownloadEventExportMetadata = Effect.fn(
  "OperationsService.loadDownloadEventExportMetadata",
)(function* (
  db: AppDatabase,
  tryDatabasePromise: TryDatabasePromise,
  plan: {
    readonly baseConditions: readonly SQL[];
    readonly limit: number;
    readonly order: "asc" | "desc";
  },
  nowIso: () => Effect.Effect<string>,
) {
  const totalRows = yield* tryDatabasePromise("Failed to count download events", () => {
    const totalQuery = db.select({ count: sql<number>`count(*)` }).from(downloadEvents);
    return plan.baseConditions.length > 0
      ? totalQuery.where(and(...plan.baseConditions))
      : totalQuery;
  });
  const total = totalRows[0]?.count ?? 0;
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

export function streamDownloadEvents(input: {
  readonly db: AppDatabase;
  readonly tryDatabasePromise: TryDatabasePromise;
  readonly plan: {
    readonly baseConditions: readonly SQL[];
    readonly limit: number;
    readonly order: "asc" | "desc";
  };
}): Stream.Stream<DownloadEvent, DatabaseError | OperationsStoredDataError> {
  const pageSize = 500;

  return Stream.unfoldChunkEffect(
    { emitted: 0, cursor: undefined as number | undefined },
    (state) =>
      Effect.gen(function* () {
        const remaining = input.plan.limit - state.emitted;
        if (remaining <= 0) {
          return Option.none<readonly [Chunk.Chunk<DownloadEvent>, typeof state]>();
        }

        let cursorCondition: SQL | undefined;

        if (state.cursor !== undefined) {
          cursorCondition =
            input.plan.order === "asc"
              ? gt(downloadEvents.id, state.cursor)
              : lt(downloadEvents.id, state.cursor);
        }
        const conditions = cursorCondition
          ? [...input.plan.baseConditions, cursorCondition]
          : [...input.plan.baseConditions];

        const rows = yield* input.tryDatabasePromise("Failed to stream download events", () => {
          const query = input.db
            .select()
            .from(downloadEvents)
            .orderBy(input.plan.order === "asc" ? asc(downloadEvents.id) : desc(downloadEvents.id))
            .limit(Math.min(pageSize, remaining));

          return conditions.length > 0 ? query.where(and(...conditions)) : query;
        });

        if (rows.length === 0) {
          return Option.none<readonly [Chunk.Chunk<DownloadEvent>, typeof state]>();
        }

        const contexts = yield* loadDownloadEventPresentationContexts(input.db, rows);
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
