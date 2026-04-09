import {
  keepPreviousData,
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/solid-query";
import type { SystemLogsResponse } from "./contracts";
import { API_BASE, fetchApi } from "./client";
import { animeKeys } from "./keys";

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
