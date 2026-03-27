import { HttpServerResponse } from "@effect/platform";
import { Schema } from "effect";

import type { SystemLog, SystemLogsResponse } from "../../../../packages/shared/src/index.ts";
import { SystemLogSchema } from "../../../../packages/shared/src/index.ts";
import { escapeCsv } from "./route-fs.ts";

const SystemLogsJsonSchema = Schema.parseJson(Schema.Array(SystemLogSchema));
const encodeSystemLogs = Schema.encodeSync(SystemLogsJsonSchema);

export function buildSystemLogsExportResponse(logs: SystemLogsResponse, format: "csv" | "json") {
  if (format === "csv") {
    const csv = [
      "id,level,event_type,message,created_at",
      ...logs.logs.map(
        (log) =>
          `${log.id},${log.level},${escapeCsv(log.event_type)},${escapeCsv(log.message)},${log.created_at}`,
      ),
    ].join("\n");

    return HttpServerResponse.text(csv, {
      contentType: "text/csv; charset=utf-8",
      headers: {
        "Content-Disposition": `attachment; filename="bakarr-logs.csv"`,
      },
    });
  }

  return HttpServerResponse.text(encodeSystemLogs([...logs.logs] satisfies SystemLog[]), {
    contentType: "application/json; charset=utf-8",
    headers: {
      "Content-Disposition": `attachment; filename="bakarr-logs.json"`,
    },
  });
}
