import {
  infiniteQueryOptions,
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { Effect } from "effect";
import { SystemLogsResponseSchema } from "@bakarr/shared";
import { API_BASE } from "~/api/constants";
import { fetchJson, fetchUnit } from "~/api/effect/api-client";
import { animeKeys } from "./keys";

export function infiniteLogsQueryOptions(
  level?: string,
  eventType?: string,
  startDate?: string,
  endDate?: string,
  refetchInterval: number | false = false,
) {
  return infiniteQueryOptions({
    queryKey: [
      ...animeKeys.system.logs(1, level, eventType, startDate, endDate).slice(0, 2),
      "infinite",
      { level, eventType, startDate, endDate },
    ] as const,
    queryFn: ({ pageParam, signal }) => {
      const params = new URLSearchParams({ page: pageParam.toString() });
      if (level) params.append("level", level);
      if (eventType) params.append("event_type", eventType);
      if (startDate) params.append("start_date", startDate);
      if (endDate) params.append("end_date", endDate);
      return Effect.runPromise(
        fetchJson(
          SystemLogsResponseSchema,
          `${API_BASE}/system/logs?${params.toString()}`,
          undefined,
          signal,
        ),
      );
    },
    placeholderData: keepPreviousData,
    getNextPageParam: (lastPage, allPages) => {
      if (allPages.length >= lastPage.total_pages) {
        return undefined;
      }
      return allPages.length + 1;
    },
    initialPageParam: 1,
    refetchInterval,
    staleTime: 1000 * 10,
  });
}

export function createInfiniteLogsQuery(
  level: string | undefined,
  eventType: string | undefined,
  startDate: string | undefined,
  endDate: string | undefined,
  options?: { refetchInterval?: number | false },
) {
  return useInfiniteQuery(
    infiniteLogsQueryOptions(level, eventType, startDate, endDate, options?.refetchInterval),
  );
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
  return useMutation({
    mutationFn: () => Effect.runPromise(fetchUnit(`${API_BASE}/system/logs`, { method: "DELETE" })),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: animeKeys.system.all });
    },
  });
}
