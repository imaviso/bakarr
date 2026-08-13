import { queryOptions, useQuery } from "@tanstack/react-query";
import { ActivityItemSchema, LibraryStatsSchema } from "@bakarr/shared";
import { API_BASE } from "~/api/constants";
import { fetchJson, runApiEffect } from "~/api/effect/api-client";
import { Schema } from "effect";
import { animeKeys } from "./keys";

export function libraryStatsQueryOptions() {
  return queryOptions({
    queryKey: animeKeys.library.stats(),
    queryFn: ({ signal }) =>
      runApiEffect(fetchJson(LibraryStatsSchema, `${API_BASE}/library/stats`, undefined, signal)),
    staleTime: 1000 * 60, // 1 minute
  });
}

export function useLibraryStatsQuery() {
  return useQuery(libraryStatsQueryOptions());
}

export function activityQueryOptions() {
  return queryOptions({
    queryKey: animeKeys.library.activity(),
    queryFn: ({ signal }) =>
      runApiEffect(
        fetchJson(
          Schema.Array(ActivityItemSchema),
          `${API_BASE}/library/activity`,
          undefined,
          signal,
        ),
      ),
    staleTime: 1000 * 30, // 30 seconds
  });
}

export function useActivityQuery() {
  return useQuery(activityQueryOptions());
}
