import { HttpRouter, HttpServerResponse } from "@effect/platform";
import { Effect, Schema } from "effect";

import { SystemLogService } from "@/features/system/system-log-service.ts";
import type { SystemLog } from "@packages/shared/index.ts";
import { SystemLogSchema } from "@packages/shared/index.ts";
import { escapeCsv } from "@/http/route-fs.ts";
import {
  SystemLogExportQuerySchema,
  SystemLogsQuerySchema,
} from "@/http/system-request-schemas.ts";
import {
  authedRouteResponse,
  decodeQuery,
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
      ({ format, logs }) => {
        if (format === "csv") {
          const csv = [
            "id,level,event_type,message,created_at",
            ...logs.logs.map(
              (log) =>
                `${log.id},${log.level},${escapeCsv(log.event_type)},${escapeCsv(log.message)},${log.created_at}`,
            ),
          ].join("\n");

          return Effect.succeed(
            HttpServerResponse.text(csv, {
              contentType: "text/csv; charset=utf-8",
              headers: {
                "Content-Disposition": `attachment; filename="bakarr-logs.csv"`,
              },
            }),
          );
        }

        return Effect.succeed(
          HttpServerResponse.text(
            Schema.encodeSync(Schema.parseJson(Schema.Array(SystemLogSchema)))([
              ...logs.logs,
            ] satisfies SystemLog[]),
            {
              contentType: "application/json; charset=utf-8",
              headers: {
                "Content-Disposition": `attachment; filename="bakarr-logs.json"`,
              },
            },
          ),
        );
      },
    ),
  ),
);
