import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/solid-query";
import type { CalendarEvent, RssFeed, RssFeedCreateRequest } from "./contracts";
import { API_BASE, fetchApi } from "./client";
import { animeKeys } from "./keys";

export function rssFeedsQueryOptions() {
  return queryOptions({
    queryKey: animeKeys.rss.all,
    queryFn: ({ signal }) => fetchApi<RssFeed[]>(`${API_BASE}/rss`, undefined, signal),
    staleTime: 1000 * 60 * 5,
  });
}

export function createRssFeedsQuery() {
  return useQuery(rssFeedsQueryOptions);
}

export function animeRssFeedsQueryOptions(animeId: number) {
  return queryOptions({
    queryKey: animeKeys.rss.anime(animeId),
    queryFn: ({ signal }) =>
      fetchApi<RssFeed[]>(`${API_BASE}/anime/${animeId}/rss`, undefined, signal),
    staleTime: 1000 * 60 * 5,
  });
}

export function createAnimeRssFeedsQuery(animeId: () => number) {
  return useQuery(() => ({
    ...animeRssFeedsQueryOptions(animeId()),
    enabled: !!animeId(),
  }));
}

export function createAddRssFeedMutation() {
  const queryClient = useQueryClient();
  return useMutation(() => ({
    mutationFn: (data: RssFeedCreateRequest) =>
      fetchApi<RssFeed>(`${API_BASE}/rss`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: animeKeys.rss.all });
    },
  }));
}

export function createDeleteRssFeedMutation() {
  const queryClient = useQueryClient();
  return useMutation(() => ({
    mutationFn: (id: number) => fetchApi(`${API_BASE}/rss/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: animeKeys.rss.all });
    },
  }));
}

export function createToggleRssFeedMutation() {
  const queryClient = useQueryClient();
  return useMutation(() => ({
    mutationFn: ({ id, enabled }: { id: number; enabled: boolean }) =>
      fetchApi(`${API_BASE}/rss/${id}/toggle`, {
        method: "PUT",
        body: JSON.stringify({ enabled }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: animeKeys.rss.all });
    },
  }));
}

export function calendarQueryOptions(start: Date, end: Date) {
  return queryOptions({
    queryKey: animeKeys.calendar(start.toISOString(), end.toISOString()),
    queryFn: ({ signal }) =>
      fetchApi<CalendarEvent[]>(
        `${API_BASE}/calendar?start=${start.toISOString()}&end=${end.toISOString()}`,
        undefined,
        signal,
      ),
    staleTime: 1000 * 60 * 10,
  });
}

export function createCalendarQuery(start: () => Date, end: () => Date) {
  return useQuery(() => ({
    ...calendarQueryOptions(start(), end()),
    placeholderData: (prev: CalendarEvent[] | undefined) => prev,
  }));
}
