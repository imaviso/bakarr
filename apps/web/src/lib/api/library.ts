import { queryOptions, useQuery } from "@tanstack/react-query";
import { ActivityItemSchema, LibraryStatsSchema } from "@bakarr/shared";
import { API_BASE } from "~/lib/api";
import { fetchJson } from "~/lib/effect/api-client";
import { Effect, Schema } from "effect";
import { animeKeys } from "./keys";

export function libraryStatsQueryOptions() {
  return queryOptions({
    queryKey: animeKeys.library.stats(),
    queryFn: ({ signal }) =>
      Effect.runPromise(
        fetchJson(LibraryStatsSchema, `${API_BASE}/library/stats`, undefined, signal),
      ),
    staleTime: 1000 * 60, // 1 minute
  });
}

export function createLibraryStatsQuery() {
  return useQuery(libraryStatsQueryOptions());
}

export function activityQueryOptions() {
  return queryOptions({
    queryKey: animeKeys.library.activity(),
    queryFn: ({ signal }) =>
      Effect.runPromise(
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

export function createActivityQuery() {
  return useQuery(activityQueryOptions());
}
