import { queryOptions, useQuery } from "@tanstack/solid-query";
import { triggerBlobDownload } from "~/lib/blob-download";
import type {
  DownloadEventsExportInput,
  DownloadEventsExportResult,
  DownloadEventsFilterInput,
  DownloadEventsPage,
} from "./contracts";
import { API_BASE, fetchApi, fetchApiResponse } from "./client";
import { animeKeys } from "./keys";

function buildDownloadEventsSearchParams(input: DownloadEventsFilterInput) {
  const params = new URLSearchParams();

  appendDownloadEventsCommonParams(params, input);

  if (input.cursor) {
    params.set("cursor", input.cursor);
  }
  if (input.direction) {
    params.set("direction", input.direction);
  }
  return params;
}

function buildDownloadEventsExportSearchParams(input: DownloadEventsExportInput) {
  const params = new URLSearchParams();

  appendDownloadEventsCommonParams(params, input);

  if (input.order) {
    params.set("order", input.order);
  }

  return params;
}

function appendDownloadEventsCommonParams(
  params: URLSearchParams,
  input: Pick<
    DownloadEventsExportInput,
    "animeId" | "downloadId" | "endDate" | "eventType" | "limit" | "startDate" | "status"
  >,
) {
  if (input.animeId !== undefined) {
    params.set("anime_id", String(input.animeId));
  }
  if (input.downloadId !== undefined) {
    params.set("download_id", String(input.downloadId));
  }
  if (input.eventType) {
    params.set("event_type", input.eventType);
  }
  if (input.status) {
    params.set("status", input.status);
  }
  if (input.startDate) {
    params.set("start_date", input.startDate);
  }
  if (input.endDate) {
    params.set("end_date", input.endDate);
  }
  if (input.limit !== undefined) {
    params.set("limit", String(input.limit));
  }
}

export function downloadEventsQueryOptionsWithFilters(input: DownloadEventsFilterInput) {
  const params = buildDownloadEventsSearchParams(input);

  return queryOptions({
    queryKey: animeKeys.downloads.events(input),
    queryFn: ({ signal }) =>
      fetchApi<DownloadEventsPage>(
        `${API_BASE}/downloads/events${params.size > 0 ? `?${params.toString()}` : ""}`,
        undefined,
        signal,
      ),
    staleTime: 1000 * 10,
  });
}

export function createDownloadEventsQuery(input: () => DownloadEventsFilterInput) {
  return useQuery(() => downloadEventsQueryOptionsWithFilters(input()));
}

export function getDownloadEventsExportUrl(
  input: DownloadEventsExportInput,
  format: "json" | "csv" = "json",
) {
  const params = buildDownloadEventsExportSearchParams(input);
  params.set("format", format);
  return `${API_BASE}/downloads/events/export?${params.toString()}`;
}

function parseExportCountHeader(value: string | null): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : 0;
}

function parseExportTruncatedHeader(value: string | null): boolean {
  return value?.toLowerCase() === "true";
}

function parseContentDispositionFilename(headerValue: string | null): string | undefined {
  if (!headerValue) {
    return undefined;
  }

  const utf8Match = /filename\*=UTF-8''([^;]+)/i.exec(headerValue);
  if (utf8Match?.[1]) {
    return decodeURIComponent(utf8Match[1]).replace(/"/g, "").trim();
  }

  const asciiMatch = /filename=([^;]+)/i.exec(headerValue);
  if (asciiMatch?.[1]) {
    return asciiMatch[1].replace(/"/g, "").trim();
  }

  return undefined;
}

export async function exportDownloadEvents(
  input: DownloadEventsExportInput,
  format: "json" | "csv" = "json",
): Promise<DownloadEventsExportResult> {
  const response = await requestDownloadEventsExport(input, format);

  const payload = await response.blob();
  const fallbackName = `download-events.${format}`;
  const fileName =
    parseContentDispositionFilename(response.headers.get("content-disposition")) ?? fallbackName;

  triggerBlobDownload(payload, fileName);

  const generatedAt = response.headers.get("x-bakarr-generated-at") ?? undefined;

  return {
    exported: parseExportCountHeader(response.headers.get("x-bakarr-exported-events")),
    format,
    ...(generatedAt === undefined ? {} : { generatedAt }),
    limit: parseExportCountHeader(response.headers.get("x-bakarr-export-limit")),
    total: parseExportCountHeader(response.headers.get("x-bakarr-total-events")),
    truncated: parseExportTruncatedHeader(response.headers.get("x-bakarr-export-truncated")),
  };
}

async function requestDownloadEventsExport(
  input: DownloadEventsExportInput,
  format: "json" | "csv",
): Promise<Response> {
  return fetchApiResponse(getDownloadEventsExportUrl(input, format), {
    method: "GET",
  });
}
