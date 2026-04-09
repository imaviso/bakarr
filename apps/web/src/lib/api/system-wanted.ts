import { queryOptions, useQuery } from "@tanstack/solid-query";
import type { MissingEpisode } from "./contracts";
import { API_BASE, fetchApi } from "./client";
import { animeKeys } from "./keys";

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
