import { HttpRouter, HttpServerResponse } from "@effect/platform";
import { Effect } from "effect";

import { SystemLogService } from "@/features/system/system-log-service.ts";
import {
  type SystemLogExportQueryInput,
  SystemLogExportQuerySchema,
  type SystemLogsQueryInput,
  SystemLogsQuerySchema,
} from "@/http/system-request-schemas.ts";
import {
  authedRouteResponse,
  decodeQueryWithLabel,
  jsonResponse,
  successResponse,
} from "@/http/router-helpers.ts";

export const logsRouter = HttpRouter.empty.pipe(
  HttpRouter.get(
    "/api/system/logs",
    authedRouteResponse(
      Effect.gen(function* () {
        const query = yield* decodeQueryWithLabel(SystemLogsQuerySchema, "system logs");
        return yield* (yield* SystemLogService).getLogs(toSystemLogsQueryInput(query));
      }),
      jsonResponse,
    ),
  ),
  HttpRouter.del(
    "/api/system/logs",
    authedRouteResponse(
      Effect.flatMap(SystemLogService, (service) => service.clearLogs()),
      successResponse,
    ),
  ),
  HttpRouter.get(
    "/api/system/logs/export",
    authedRouteResponse(
      Effect.gen(function* () {
        const query = yield* decodeQueryWithLabel(SystemLogExportQuerySchema, "system log export");
        const service = yield* SystemLogService;
        const input = toSystemLogExportInput(query);

        if ((query.format ?? "json") === "csv") {
          const exported = yield* service.streamLogExportCsv(input);
          return { format: "csv" as const, exported };
        }

        const exported = yield* service.streamLogExportJson(input);
        return { format: "json" as const, exported };
      }),
      ({ format, exported }) => {
        const exportHeaders = buildSystemLogExportHeaders(exported.header);

        if (format === "csv") {
          return Effect.succeed(
            HttpServerResponse.stream(exported.stream, {
              contentType: "text/csv; charset=utf-8",
              headers: {
                ...exportHeaders,
                "Content-Disposition": `attachment; filename="bakarr-logs.csv"`,
              },
            }),
          );
        }

        return Effect.succeed(
          HttpServerResponse.stream(exported.stream, {
            contentType: "application/json; charset=utf-8",
            headers: {
              ...exportHeaders,
              "Content-Disposition": `attachment; filename="bakarr-logs.json"`,
            },
          }),
        );
      },
    ),
  ),
);

function toSystemLogsQueryInput(query: SystemLogsQueryInput) {
  return {
    ...(query.end_date === undefined ? {} : { endDate: query.end_date }),
    ...(query.event_type === undefined ? {} : { eventType: query.event_type }),
    ...(query.level === undefined ? {} : { level: query.level }),
    page: query.page ?? 1,
    ...(query.start_date === undefined ? {} : { startDate: query.start_date }),
  };
}

function toSystemLogExportInput(query: SystemLogExportQueryInput) {
  return {
    ...(query.end_date === undefined ? {} : { endDate: query.end_date }),
    ...(query.event_type === undefined ? {} : { eventType: query.event_type }),
    ...(query.level === undefined ? {} : { level: query.level }),
    ...(query.start_date === undefined ? {} : { startDate: query.start_date }),
  };
}

function buildSystemLogExportHeaders(header: {
  readonly exported: number;
  readonly generated_at: string;
  readonly limit: number;
  readonly total: number;
  readonly truncated: boolean;
}) {
  return {
    "X-Bakarr-Export-Limit": String(header.limit),
    "X-Bakarr-Export-Truncated": String(header.truncated),
    "X-Bakarr-Exported-Logs": String(header.exported),
    "X-Bakarr-Generated-At": header.generated_at,
    "X-Bakarr-Total-Logs": String(header.total),
  };
}
