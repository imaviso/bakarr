import { HttpRouter } from "@effect/platform";
import { Effect } from "effect";

import { SystemLogService } from "../features/system/system-log-service.ts";
import { buildSystemLogsExportResponse } from "./system-logs-export.ts";
import { SystemLogExportQuerySchema, SystemLogsQuerySchema } from "./system-request-schemas.ts";
import {
  authedRouteResponse,
  decodeQuery,
  decodeQueryWithLabel,
  jsonResponse,
  successResponse,
} from "./router-helpers.ts";

export const logsRouter = HttpRouter.empty.pipe(
  HttpRouter.get(
    "/api/system/logs",
    authedRouteResponse(
      Effect.gen(function* () {
        const query = yield* decodeQueryWithLabel(SystemLogsQuerySchema, "system logs");
        return yield* (yield* SystemLogService).getLogs({
          endDate: query.end_date,
          eventType: query.event_type,
          level: query.level,
          page: query.page ?? 1,
          startDate: query.start_date,
        });
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
        const query = yield* decodeQuery(SystemLogExportQuerySchema);
        const logs = yield* (yield* SystemLogService).getLogs({
          endDate: query.end_date,
          eventType: query.event_type,
          level: query.level,
          page: 1,
          pageSize: 10_000,
          startDate: query.start_date,
        });
        return { format: query.format ?? "json", logs };
      }),
      ({ format, logs }) => buildSystemLogsExportResponse(logs, format),
    ),
  ),
);
