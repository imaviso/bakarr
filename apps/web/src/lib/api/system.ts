import {
  keepPreviousData,
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/solid-query";
import { getAuthHeaders, logout } from "~/lib/auth";
import type {
  BackgroundJobStatus,
  BrowseResult,
  BulkUnmappedFolderControlRequest,
  CalendarEvent,
  Config,
  Download,
  DownloadEventsExportInput,
  DownloadEventsExportResult,
  DownloadEventsFilterInput,
  DownloadEventsPage,
  ImportFileRequest,
  ImportResult,
  MissingEpisode,
  OpsDashboard,
  RssFeed,
  RssFeedCreateRequest,
  ScannerState,
  ScanResult,
  SystemLogsResponse,
  SystemStatus,
  UnmappedFolderControlRequest,
  UnmappedFolderImportRequest,
} from "./contracts";
import { API_BASE, fetchApi } from "./client";
import { animeKeys } from "./keys";

export function systemConfigQueryOptions() {
  return queryOptions({
    queryKey: animeKeys.system.config(),
    queryFn: ({ signal }) => fetchApi<Config>(`${API_BASE}/system/config`, undefined, signal),
    staleTime: Infinity,
    placeholderData: keepPreviousData,
  });
}

export function createSystemConfigQuery(enabled: () => boolean = () => true) {
  return useQuery(() => ({
    ...systemConfigQueryOptions(),
    enabled: enabled(),
  }));
}

export function createUpdateSystemConfigMutation() {
  const queryClient = useQueryClient();
  return useMutation(() => ({
    mutationFn: (data: Config) =>
      fetchApi(`${API_BASE}/system/config`, {
        method: "PUT",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: animeKeys.system.config() });
    },
  }));
}

export function systemStatusQueryOptions() {
  return queryOptions({
    queryKey: animeKeys.system.status(),
    queryFn: ({ signal }) => fetchApi<SystemStatus>(`${API_BASE}/system/status`, undefined, signal),
    refetchInterval: 30000,
  });
}

export function createSystemStatusQuery() {
  return useQuery(systemStatusQueryOptions);
}

export function createTriggerScanMutation() {
  return useMutation(() => ({
    mutationFn: () => fetchApi(`${API_BASE}/system/tasks/scan`, { method: "POST" }),
  }));
}

export function createTriggerRssCheckMutation() {
  return useMutation(() => ({
    mutationFn: () => fetchApi(`${API_BASE}/system/tasks/rss`, { method: "POST" }),
  }));
}

export function createTriggerMetadataRefreshMutation() {
  return useMutation(() => ({
    mutationFn: () => fetchApi(`${API_BASE}/system/tasks/metadata-refresh`, { method: "POST" }),
  }));
}

// ==================== RSS & Others ====================

export function rssFeedsQueryOptions() {
  return queryOptions({
    queryKey: animeKeys.rss.all,
    queryFn: ({ signal }) => fetchApi<RssFeed[]>(`${API_BASE}/rss`, undefined, signal),
    staleTime: 1000 * 60 * 5,
  });
}

export function createRssFeedsQuery() {
  return useQuery(rssFeedsQueryOptions);
}

export function animeRssFeedsQueryOptions(animeId: number) {
  return queryOptions({
    queryKey: animeKeys.rss.anime(animeId),
    queryFn: ({ signal }) =>
      fetchApi<RssFeed[]>(`${API_BASE}/anime/${animeId}/rss`, undefined, signal),
    staleTime: 1000 * 60 * 5,
  });
}

export function createAnimeRssFeedsQuery(animeId: () => number) {
  return useQuery(() => ({
    ...animeRssFeedsQueryOptions(animeId()),
    enabled: !!animeId(),
  }));
}

export function createAddRssFeedMutation() {
  const queryClient = useQueryClient();
  return useMutation(() => ({
    mutationFn: (data: RssFeedCreateRequest) =>
      fetchApi<RssFeed>(`${API_BASE}/rss`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: animeKeys.rss.all });
    },
  }));
}

export function createDeleteRssFeedMutation() {
  const queryClient = useQueryClient();
  return useMutation(() => ({
    mutationFn: (id: number) => fetchApi(`${API_BASE}/rss/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: animeKeys.rss.all });
    },
  }));
}

export function createToggleRssFeedMutation() {
  const queryClient = useQueryClient();
  return useMutation(() => ({
    mutationFn: ({ id, enabled }: { id: number; enabled: boolean }) =>
      fetchApi(`${API_BASE}/rss/${id}/toggle`, {
        method: "PUT",
        body: JSON.stringify({ enabled }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: animeKeys.rss.all });
    },
  }));
}

export function calendarQueryOptions(start: Date, end: Date) {
  return queryOptions({
    queryKey: animeKeys.calendar(start.toISOString(), end.toISOString()),
    queryFn: ({ signal }) =>
      fetchApi<CalendarEvent[]>(
        `${API_BASE}/calendar?start=${start.toISOString()}&end=${end.toISOString()}`,
        undefined,
        signal,
      ),
    staleTime: 1000 * 60 * 10,
  });
}

export function createCalendarQuery(start: () => Date, end: () => Date) {
  return useQuery(() => ({
    ...calendarQueryOptions(start(), end()),
    placeholderData: (prev: CalendarEvent[] | undefined) => prev,
  }));
}

export function downloadQueueQueryOptions() {
  return queryOptions({
    queryKey: animeKeys.downloads.queue(),
    queryFn: ({ signal }) => fetchApi<Download[]>(`${API_BASE}/downloads/queue`, undefined, signal),
    refetchInterval: 5000,
  });
}

export function createDownloadQueueQuery() {
  return useQuery(downloadQueueQueryOptions);
}

export function downloadHistoryQueryOptions() {
  return queryOptions({
    queryKey: animeKeys.downloads.history(),
    queryFn: ({ signal }) =>
      fetchApi<Download[]>(`${API_BASE}/downloads/history`, undefined, signal),
    staleTime: 1000 * 60,
  });
}

export function createDownloadHistoryQuery() {
  return useQuery(downloadHistoryQueryOptions);
}

export function createSearchMissingMutation() {
  const queryClient = useQueryClient();
  return useMutation(() => ({
    mutationFn: (animeId?: number) =>
      fetchApi(`${API_BASE}/downloads/search-missing`, {
        method: "POST",
        body: JSON.stringify({ anime_id: animeId }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: animeKeys.downloads.all });
    },
  }));
}

function invalidateDownloadQueries(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: animeKeys.downloads.all });
  void queryClient.invalidateQueries({ queryKey: animeKeys.system.all });
}

export function createPauseDownloadMutation() {
  const queryClient = useQueryClient();
  return useMutation(() => ({
    mutationFn: (downloadId: number) =>
      fetchApi(`${API_BASE}/downloads/${downloadId}/pause`, { method: "POST" }),
    onSuccess: () => {
      invalidateDownloadQueries(queryClient);
    },
  }));
}

export function createResumeDownloadMutation() {
  const queryClient = useQueryClient();
  return useMutation(() => ({
    mutationFn: (downloadId: number) =>
      fetchApi(`${API_BASE}/downloads/${downloadId}/resume`, {
        method: "POST",
      }),
    onSuccess: () => {
      invalidateDownloadQueries(queryClient);
    },
  }));
}

export function createRetryDownloadMutation() {
  const queryClient = useQueryClient();
  return useMutation(() => ({
    mutationFn: (downloadId: number) =>
      fetchApi(`${API_BASE}/downloads/${downloadId}/retry`, { method: "POST" }),
    onSuccess: () => {
      invalidateDownloadQueries(queryClient);
    },
  }));
}

export function createDeleteDownloadMutation() {
  const queryClient = useQueryClient();
  return useMutation(() => ({
    mutationFn: (input: { downloadId: number; deleteFiles?: boolean }) =>
      fetchApi(
        `${API_BASE}/downloads/${input.downloadId}?delete_files=${
          input.deleteFiles ? "true" : "false"
        }`,
        { method: "DELETE" },
      ),
    onSuccess: () => {
      invalidateDownloadQueries(queryClient);
    },
  }));
}

export function createSyncDownloadsMutation() {
  const queryClient = useQueryClient();
  return useMutation(() => ({
    mutationFn: () => fetchApi(`${API_BASE}/downloads/sync`, { method: "POST" }),
    onSuccess: () => {
      invalidateDownloadQueries(queryClient);
    },
  }));
}

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

export function createReconcileDownloadMutation() {
  const queryClient = useQueryClient();
  return useMutation(() => ({
    mutationFn: (downloadId: number) =>
      fetchApi(`${API_BASE}/downloads/${downloadId}/reconcile`, {
        method: "POST",
      }),
    onSuccess: () => {
      invalidateDownloadQueries(queryClient);
    },
  }));
}

export function wantedQueryOptions(limit = 100) {
  return queryOptions({
    queryKey: animeKeys.wanted(limit),
    queryFn: ({ signal }) =>
      fetchApi<MissingEpisode[]>(`${API_BASE}/wanted/missing?limit=${limit}`, undefined, signal),
    staleTime: 1000 * 60 * 5,
  });
}

export function createWantedQuery(limit: () => number) {
  return useQuery(() => wantedQueryOptions(limit()));
}

export function unmappedFoldersQueryOptions() {
  return queryOptions({
    queryKey: animeKeys.library.unmapped(),
    queryFn: ({ signal }) =>
      fetchApi<ScannerState>(`${API_BASE}/library/unmapped`, undefined, signal),
    refetchInterval: (query) =>
      query.state.data?.is_scanning || query.state.data?.has_outstanding_matches ? 1000 : false,
  });
}

export function createUnmappedFoldersQuery() {
  return useQuery(unmappedFoldersQueryOptions);
}

export function createScanLibraryMutation() {
  const queryClient = useQueryClient();
  return useMutation(() => ({
    mutationFn: () => fetchApi(`${API_BASE}/library/unmapped/scan`, { method: "POST" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: animeKeys.library.unmapped() });
      void queryClient.invalidateQueries({ queryKey: animeKeys.system.jobs() });
    },
  }));
}

export function createControlUnmappedFolderMutation() {
  const queryClient = useQueryClient();
  return useMutation(() => ({
    mutationFn: (data: UnmappedFolderControlRequest) =>
      fetchApi(`${API_BASE}/library/unmapped/control`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: animeKeys.library.unmapped() });
      void queryClient.invalidateQueries({ queryKey: animeKeys.system.jobs() });
    },
  }));
}

export function createBulkControlUnmappedFoldersMutation() {
  const queryClient = useQueryClient();
  return useMutation(() => ({
    mutationFn: (data: BulkUnmappedFolderControlRequest) =>
      fetchApi(`${API_BASE}/library/unmapped/control/bulk`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: animeKeys.library.unmapped() });
      void queryClient.invalidateQueries({ queryKey: animeKeys.system.jobs() });
    },
  }));
}

export function systemJobsQueryOptions() {
  return queryOptions({
    queryKey: animeKeys.system.jobs(),
    queryFn: ({ signal }) =>
      fetchApi<BackgroundJobStatus[]>(`${API_BASE}/system/jobs`, undefined, signal),
    staleTime: 1000 * 10,
    refetchInterval: (query) => {
      const unmappedScan = query.state.data?.find((job) => job.name === "unmapped_scan");

      return unmappedScan?.is_running ? 1000 : false;
    },
  });
}

export function createSystemJobsQuery() {
  return useQuery(systemJobsQueryOptions);
}

export function systemDashboardQueryOptions() {
  return queryOptions({
    queryKey: animeKeys.system.dashboard(),
    queryFn: ({ signal }) =>
      fetchApi<OpsDashboard>(`${API_BASE}/system/dashboard`, undefined, signal),
    staleTime: 1000 * 10,
  });
}

export function createSystemDashboardQuery() {
  return useQuery(() => systemDashboardQueryOptions());
}

export function createImportUnmappedFolderMutation() {
  const queryClient = useQueryClient();
  return useMutation(() => ({
    mutationFn: (data: UnmappedFolderImportRequest) =>
      fetchApi(`${API_BASE}/library/unmapped/import`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: (_, variables) => {
      void queryClient.invalidateQueries({ queryKey: animeKeys.library.unmapped() });
      void queryClient.invalidateQueries({ queryKey: animeKeys.lists() });
      void queryClient.invalidateQueries({
        queryKey: animeKeys.detail(variables.anime_id),
      });
      void queryClient.invalidateQueries({
        queryKey: animeKeys.episodes(variables.anime_id),
      });
      void queryClient.invalidateQueries({ queryKey: animeKeys.system.status() });
    },
  }));
}

export function systemLogsQueryOptions(
  page = 1,
  level?: string,
  eventType?: string,
  startDate?: string,
  endDate?: string,
) {
  return queryOptions({
    queryKey: animeKeys.system.logs(page, level, eventType, startDate, endDate),
    queryFn: ({ signal }) => {
      const params = new URLSearchParams({ page: page.toString() });
      if (level) params.append("level", level);
      if (eventType) params.append("event_type", eventType);
      if (startDate) params.append("start_date", startDate);
      if (endDate) params.append("end_date", endDate);
      return fetchApi<SystemLogsResponse>(
        `${API_BASE}/system/logs?${params.toString()}`,
        undefined,
        signal,
      );
    },
    placeholderData: keepPreviousData,
    staleTime: 1000 * 10,
  });
}

export function createSystemLogsQuery(
  page: () => number,
  level: () => string | undefined,
  eventType: () => string | undefined,
  startDate: () => string | undefined,
  endDate: () => string | undefined,
) {
  return useQuery(() => ({
    ...systemLogsQueryOptions(page(), level(), eventType(), startDate(), endDate()),
  }));
}

export function getExportLogsUrl(
  level?: string,
  eventType?: string,
  startDate?: string,
  endDate?: string,
  format: "json" | "csv" = "json",
) {
  const params = new URLSearchParams();
  if (level) params.append("level", level);
  if (eventType) params.append("event_type", eventType);
  if (startDate) params.append("start_date", startDate);
  if (endDate) params.append("end_date", endDate);
  params.append("format", format);
  return `${API_BASE}/system/logs/export?${params.toString()}`;
}

export function createClearLogsMutation() {
  const queryClient = useQueryClient();
  return useMutation(() => ({
    mutationFn: () => fetchApi(`${API_BASE}/system/logs`, { method: "DELETE" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: animeKeys.system.all });
    },
  }));
}

export function createScanImportPathMutation() {
  return useMutation(() => ({
    mutationFn: (data: { path: string; anime_id?: number }) =>
      fetchApi<ScanResult>(`${API_BASE}/library/import/scan`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
  }));
}

export function createImportFilesMutation() {
  const queryClient = useQueryClient();
  return useMutation(() => ({
    mutationFn: (files: ImportFileRequest[]) =>
      fetchApi<ImportResult>(`${API_BASE}/library/import`, {
        method: "POST",
        body: JSON.stringify({ files }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: animeKeys.lists() });
      void queryClient.invalidateQueries({ queryKey: animeKeys.library.all });
      void queryClient.invalidateQueries({ queryKey: animeKeys.system.status() });
    },
  }));
}

export function browsePathQueryOptions(
  path: string,
  pagination?: { limit: number; offset: number },
) {
  const params = new URLSearchParams({ path });
  if (pagination) {
    params.set("limit", String(pagination.limit));
    if (pagination.offset) params.set("offset", String(pagination.offset));
  }
  return queryOptions({
    queryKey: animeKeys.browse(path, pagination?.offset, pagination?.limit),
    queryFn: ({ signal }) =>
      fetchApi<BrowseResult>(`${API_BASE}/library/browse?${params.toString()}`, undefined, signal),
    placeholderData: keepPreviousData,
    staleTime: 1000 * 60 * 60,
  });
}

export function createBrowsePathQuery(
  path: () => string,
  pagination?: () => { limit: number; offset: number },
) {
  return useQuery(() => ({
    ...browsePathQueryOptions(path(), pagination?.()),
  }));
}
