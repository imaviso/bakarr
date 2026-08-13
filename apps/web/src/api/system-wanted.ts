import { queryOptions, useQuery } from "@tanstack/react-query";
import { Schema } from "effect";
import { MissingUnitSchema } from "@bakarr/shared";
import { API_BASE } from "~/api/constants";
import { fetchJson, runApiEffect } from "~/api/effect/api-client";
import { animeKeys } from "./keys";

export function wantedQueryOptions(limit = 100) {
  return queryOptions({
    queryKey: animeKeys.wanted(limit),
    queryFn: ({ signal }) =>
      runApiEffect(
        fetchJson(
          Schema.mutable(Schema.Array(MissingUnitSchema)),
          `${API_BASE}/wanted/missing?limit=${limit}`,
          undefined,
          signal,
        ),
      ),
    staleTime: 1000 * 60 * 5,
  });
}

export function useWantedQuery(limit: number) {
  return useQuery(wantedQueryOptions(limit));
}
