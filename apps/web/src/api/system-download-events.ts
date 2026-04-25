import { queryOptions, useMutation, useQuery } from "@tanstack/react-query";
import { triggerBlobDownload } from "~/infra/blob-download";
import type {
  DownloadEventsExportInput,
  DownloadEventsExportResult,
  DownloadEventsFilterInput,
} from "./contracts";
import { Effect } from "effect";
import { DownloadEventsPageSchema } from "@bakarr/shared";
import { API_BASE } from "~/api/constants";
import {
  fetchJson,
  fetchResponse,
  type ApiClientError,
  type ApiUnauthorizedError,
} from "~/api/effect/api-client";
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
      Effect.runPromise(
        fetchJson(
          DownloadEventsPageSchema,
          `${API_BASE}/downloads/events${params.size > 0 ? `?${params.toString()}` : ""}`,
          undefined,
          signal,
        ),
      ),
    staleTime: 1000 * 10,
  });
}

export function createDownloadEventsQuery(
  input: DownloadEventsFilterInput,
  options?: {
    enabled?: boolean;
    refetchInterval?: number | false;
  },
) {
  const query = downloadEventsQueryOptionsWithFilters(input);

  return useQuery({
    ...query,
    enabled: options?.enabled ?? true,
    ...(options?.refetchInterval === undefined ? {} : { refetchInterval: options.refetchInterval }),
  });
}

export function getDownloadEventsExportUrl(
  input: DownloadEventsExportInput,
  format: "json" | "csv" = "json",
) {
  const params = buildDownloadEventsExportSearchParams(input);
  params.set("format", format);
  return `${API_BASE}/downloads/events/export?${params.toString()}`;
}

function parseExportCountHeader(name: string, value: string | null): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`Invalid ${name} export header`);
  }
  return Math.trunc(parsed);
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

export function createDownloadEventsExportMutation() {
  return useMutation({
    mutationFn: (input: { filter: DownloadEventsExportInput; format: "json" | "csv" }) =>
      exportDownloadEvents(input.filter, input.format),
  });
}

async function exportDownloadEvents(
  input: DownloadEventsExportInput,
  format: "json" | "csv",
): Promise<DownloadEventsExportResult> {
  const response = await Effect.runPromise(requestDownloadEventsExport(input, format));
  const payload = await response.blob();
  const fileName = parseContentDispositionFilename(response.headers.get("content-disposition"));

  if (fileName === undefined) {
    throw new Error("Missing export filename header");
  }

  triggerBlobDownload(payload, fileName);

  const generatedAt = response.headers.get("x-bakarr-generated-at") ?? undefined;

  return {
    exported: parseExportCountHeader(
      "x-bakarr-exported-events",
      response.headers.get("x-bakarr-exported-events"),
    ),
    format,
    ...(generatedAt === undefined ? {} : { generatedAt }),
    limit: parseExportCountHeader(
      "x-bakarr-export-limit",
      response.headers.get("x-bakarr-export-limit"),
    ),
    total: parseExportCountHeader(
      "x-bakarr-total-events",
      response.headers.get("x-bakarr-total-events"),
    ),
    truncated: parseExportTruncatedHeader(response.headers.get("x-bakarr-export-truncated")),
  };
}

function requestDownloadEventsExport(
  input: DownloadEventsExportInput,
  format: "json" | "csv",
): Effect.Effect<Response, ApiClientError | ApiUnauthorizedError> {
  return fetchResponse(getDownloadEventsExportUrl(input, format), {
    method: "GET",
  });
}
