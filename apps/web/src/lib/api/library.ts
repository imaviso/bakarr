import { queryOptions, useQuery } from "@tanstack/solid-query";
import type { ActivityItem, LibraryStats } from "./contracts";
import { API_BASE, fetchApi } from "./client";
import { animeKeys } from "./keys";

export function libraryStatsQueryOptions() {
  return queryOptions({
    queryKey: animeKeys.library.stats(),
    queryFn: ({ signal }) => fetchApi<LibraryStats>(`${API_BASE}/library/stats`, undefined, signal),
    staleTime: 1000 * 60, // 1 minute
  });
}

export function createLibraryStatsQuery() {
  return useQuery(libraryStatsQueryOptions);
}

export function activityQueryOptions() {
  return queryOptions({
    queryKey: animeKeys.library.activity(),
    queryFn: ({ signal }) =>
      fetchApi<ActivityItem[]>(`${API_BASE}/library/activity`, undefined, signal),
    staleTime: 1000 * 30, // 30 seconds
  });
}

export function createActivityQuery() {
  return useQuery(activityQueryOptions);
}
