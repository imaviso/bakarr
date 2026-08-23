import { queryOptions } from "@tanstack/react-query";
import { Schema } from "effect";
import { MissingUnitSchema } from "@bakarr/shared";
import { apiUrl, fetchJson, runApiEffect } from "@/api/effect/api-client";
import { animeKeys } from "./keys";

export function wantedQueryOptions(limit = 100) {
  return queryOptions({
    queryKey: animeKeys.wanted(limit),
    queryFn: ({ signal }) =>
      runApiEffect(
        fetchJson(
          Schema.mutable(Schema.Array(MissingUnitSchema)),
          apiUrl("/wanted/missing", { limit }),
          undefined,
          signal,
        ),
      ),
    staleTime: 1000 * 60 * 5,
  });
}
