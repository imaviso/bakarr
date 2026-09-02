import { keepPreviousData, queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import type { RssFeedCreateRequest } from "./contracts";
import { Schema } from "effect";
import { CalendarEventSchema, RssFeedSchema } from "@bakarr/shared";
import { API_BASE } from "@/api/constants";
import { apiUrl, fetchJson, fetchUnit, runApiEffect } from "@/api/effect/api-client";
import { animeKeys } from "./keys";

export function rssFeedsQueryOptions() {
  return queryOptions({
    queryKey: animeKeys.rss.all,
    queryFn: ({ signal }) =>
      runApiEffect(
        fetchJson(
          Schema.mutable(Schema.Array(RssFeedSchema)),
          `${API_BASE}/rss`,
          undefined,
          signal,
        ),
      ),
    staleTime: 1000 * 60 * 5,
  });
}

export function useAddRssFeedMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: RssFeedCreateRequest) =>
      runApiEffect(
        fetchJson(RssFeedSchema, `${API_BASE}/rss`, {
          method: "POST",
          body: data,
        }),
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: animeKeys.rss.all });
    },
  });
}

export function useDeleteRssFeedMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      runApiEffect(fetchUnit(`${API_BASE}/rss/${id}`, { method: "DELETE" })),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: animeKeys.rss.all });
    },
  });
}

export function useToggleRssFeedMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, enabled }: { id: number; enabled: boolean }) =>
      runApiEffect(
        fetchUnit(`${API_BASE}/rss/${id}/toggle`, {
          method: "PUT",
          body: { enabled },
        }),
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: animeKeys.rss.all });
    },
  });
}

export function calendarQueryOptions(start: Date, end: Date) {
  return queryOptions({
    queryKey: animeKeys.calendar(start.toISOString(), end.toISOString()),
    queryFn: ({ signal }) =>
      runApiEffect(
        fetchJson(
          Schema.mutable(Schema.Array(CalendarEventSchema)),
          apiUrl("/calendar", { start: start.toISOString(), end: end.toISOString() }),
          undefined,
          signal,
        ),
      ),
    placeholderData: keepPreviousData,
    staleTime: 1000 * 60 * 10,
  });
}
