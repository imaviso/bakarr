import { HttpServerResponse } from "@effect/platform";
import { Schema } from "effect";

import {
  DownloadEventsExportSchema,
  type DownloadEventsExport,
} from "../../../../packages/shared/src/index.ts";
import { escapeCsv } from "./route-fs.ts";

const DownloadEventsExportJsonSchema = Schema.parseJson(DownloadEventsExportSchema);
const encodeDownloadEventsExport = Schema.encodeSync(DownloadEventsExportJsonSchema);

export function buildDownloadEventsExportResponse(
  page: DownloadEventsExport,
  format: "csv" | "json",
  headers: Record<string, string> = {},
) {
  const exportHeaders = {
    ...headers,
    "X-Bakarr-Export-Limit": String(page.limit),
    "X-Bakarr-Export-Order": page.order,
    "X-Bakarr-Export-Truncated": String(page.truncated),
    "X-Bakarr-Exported-Events": String(page.exported),
    "X-Bakarr-Generated-At": page.generated_at,
    "X-Bakarr-Total-Events": String(page.total),
  };

  if (format === "csv") {
    const csv = [
      "id,created_at,event_type,from_status,to_status,anime_id,anime_title,download_id,torrent_name,message,metadata,metadata_json",
      ...page.events.map((event) =>
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
        ].join(","),
      ),
    ].join("\n");

    return HttpServerResponse.text(csv, {
      contentType: "text/csv; charset=utf-8",
      headers: {
        ...exportHeaders,
        "Content-Disposition": `attachment; filename="bakarr-download-events.csv"`,
      },
    });
  }

  return HttpServerResponse.text(encodeDownloadEventsExport(page), {
    contentType: "application/json; charset=utf-8",
    headers: {
      ...exportHeaders,
      "Content-Disposition": `attachment; filename="bakarr-download-events.json"`,
    },
  });
}
