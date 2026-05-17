import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CalendarEvent, RssFeedCreateRequest } from "./contracts";
import { Effect, Schema } from "effect";
import { CalendarEventSchema, RssFeedSchema } from "@bakarr/shared";
import { API_BASE } from "~/api/constants";
import { fetchJson, fetchUnit } from "~/api/effect/api-client";
import { animeKeys } from "./keys";

export function rssFeedsQueryOptions() {
  return queryOptions({
    queryKey: animeKeys.rss.all,
    queryFn: ({ signal }) =>
      Effect.runPromise(
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

export function useRssFeedsQuery() {
  return useQuery(rssFeedsQueryOptions());
}

export function animeRssFeedsQueryOptions(mediaId: number) {
  return queryOptions({
    queryKey: animeKeys.rss.media(mediaId),
    queryFn: ({ signal }) =>
      Effect.runPromise(
        fetchJson(
          Schema.mutable(Schema.Array(RssFeedSchema)),
          `${API_BASE}/media/${mediaId}/rss`,
          undefined,
          signal,
        ),
      ),
    staleTime: 1000 * 60 * 5,
  });
}

export function useAnimeRssFeedsQuery(mediaId: number) {
  return useQuery({
    ...animeRssFeedsQueryOptions(mediaId),
    enabled: !!mediaId,
  });
}

export function useAddRssFeedMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: RssFeedCreateRequest) =>
      Effect.runPromise(
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
      Effect.runPromise(fetchUnit(`${API_BASE}/rss/${id}`, { method: "DELETE" })),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: animeKeys.rss.all });
    },
  });
}

export function useToggleRssFeedMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, enabled }: { id: number; enabled: boolean }) =>
      Effect.runPromise(
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
      Effect.runPromise(
        fetchJson(
          Schema.mutable(Schema.Array(CalendarEventSchema)),
          `${API_BASE}/calendar?start=${start.toISOString()}&end=${end.toISOString()}`,
          undefined,
          signal,
        ),
      ),
    staleTime: 1000 * 60 * 10,
  });
}

export function useCalendarQuery(start: Date, end: Date) {
  return useQuery({
    ...calendarQueryOptions(start, end),
    placeholderData: (prev: CalendarEvent[] | undefined) => prev,
  });
}
