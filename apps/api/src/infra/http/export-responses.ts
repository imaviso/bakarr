import { Effect, Record, Stream } from "effect";
import * as HttpServerResponse from "effect/unstable/http/HttpServerResponse";

export interface ExportHeaderInput {
  readonly exported: number;
  readonly generated_at: string;
  readonly limit: number;
  readonly order?: string;
  readonly total: number;
  readonly truncated: boolean;
}

export function buildExportHeaders(
  header: ExportHeaderInput,
  exportedKey: "events" | "logs",
): Record<string, string> {
  const noun = exportedKey === "events" ? "Events" : "Logs";
  return {
    "X-Bakarr-Export-Limit": globalThis.String(header.limit),
    ...(header.order === undefined ? {} : { "X-Bakarr-Export-Order": header.order }),
    "X-Bakarr-Export-Truncated": globalThis.String(header.truncated),
    [`X-Bakarr-Exported-${noun}`]: globalThis.String(header.exported),
    "X-Bakarr-Generated-At": header.generated_at,
    [`X-Bakarr-Total-${noun}`]: globalThis.String(header.total),
  };
}

export function buildExportStreamResponse<E>(
  format: "csv" | "json",
  stream: Stream.Stream<Uint8Array, E>,
  filename: string,
  headers: Record<string, string>,
): Effect.Effect<HttpServerResponse.HttpServerResponse> {
  if (format === "csv") {
    return Effect.succeed(
      HttpServerResponse.stream(stream, {
        contentType: "text/csv; charset=utf-8",
        headers: {
          ...headers,
          "Content-Disposition": `attachment; filename="${filename}"`,
        },
      }),
    );
  }

  return Effect.succeed(
    HttpServerResponse.stream(stream, {
      contentType: "application/json; charset=utf-8",
      headers: {
        ...headers,
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    }),
  );
}
