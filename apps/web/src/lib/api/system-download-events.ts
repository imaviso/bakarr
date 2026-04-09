import { queryOptions, useQuery } from "@tanstack/solid-query";
import { getAuthHeaders, logout } from "~/lib/auth";
import type {
  DownloadEventsExportInput,
  DownloadEventsExportResult,
  DownloadEventsFilterInput,
  DownloadEventsPage,
} from "./contracts";
import { API_BASE, fetchApi } from "./client";
import { animeKeys } from "./keys";

export function downloadEventsQueryOptions(limit = 25) {
  return downloadEventsQueryOptionsWithFilters({ limit });
}

function buildDownloadEventsSearchParams(input: DownloadEventsFilterInput) {
  const params = new URLSearchParams();

  if (input.animeId !== undefined) {
    params.set("anime_id", String(input.animeId));
  }
  if (input.downloadId !== undefined) {
    params.set("download_id", String(input.downloadId));
  }
  if (input.cursor) {
    params.set("cursor", input.cursor);
  }
  if (input.direction) {
    params.set("direction", input.direction);
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

  return params;
}

function buildDownloadEventsExportSearchParams(input: DownloadEventsExportInput) {
  const params = new URLSearchParams();

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
  if (input.order) {
    params.set("order", input.order);
  }

  return params;
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

function triggerBlobDownload(blob: Blob, fileName: string) {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(objectUrl);
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
  const endpoint = getDownloadEventsExportUrl(input, format);
  const response = await fetch(endpoint, {
    method: "GET",
    headers: getAuthHeaders(),
  });

  if (response.status === 401) {
    void logout();
    throw new Error("Session expired");
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || `API error: ${response.status}`);
  }

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
