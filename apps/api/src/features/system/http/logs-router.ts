import { HttpRouter } from "@effect/platform";
import { Effect } from "effect";
import { SystemLogsResponseSchema } from "@packages/shared/index.ts";

import { SystemLogService } from "@/features/system/system-log-service.ts";
import { buildExportHeaders, buildExportStreamResponse } from "@/http/shared/export-responses.ts";
import {
  SystemLogExportQuerySchema,
  SystemLogsQuerySchema,
  toSystemLogExportQueryParams,
  toSystemLogsQueryParams,
} from "@/features/system/http/request-schemas.ts";
import {
  authedRouteResponse,
  decodeQueryWithLabel,
  schemaJsonResponse,
  successResponse,
} from "@/http/shared/router-helpers.ts";

export const logsRouter = HttpRouter.empty.pipe(
  HttpRouter.get(
    "/api/system/logs",
    authedRouteResponse(
      Effect.gen(function* () {
        const query = yield* decodeQueryWithLabel(SystemLogsQuerySchema, "system logs");
        return yield* (yield* SystemLogService).getLogs(toSystemLogsQueryParams(query));
      }),
      schemaJsonResponse(SystemLogsResponseSchema),
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
        const input = toSystemLogExportQueryParams(query);

        if ((query.format ?? "json") === "csv") {
          const exported = yield* service.streamLogExportCsv(input);
          const result: { format: "csv"; exported: typeof exported } = { format: "csv", exported };
          return result;
        }

        const exported = yield* service.streamLogExportJson(input);
        const result: { format: "json"; exported: typeof exported } = { format: "json", exported };
        return result;
      }),
      ({ format, exported }) =>
        buildExportStreamResponse(
          format,
          exported.stream,
          format === "csv" ? "bakarr-logs.csv" : "bakarr-logs.json",
          buildExportHeaders(exported.header, "logs"),
        ),
    ),
  ),
);
