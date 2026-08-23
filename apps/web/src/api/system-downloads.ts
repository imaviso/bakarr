import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { Schema } from "effect";
import { AsyncOperationAcceptedSchema, DownloadSchema, DownloadStatusSchema } from "@bakarr/shared";
import { API_BASE } from "@/api/constants";
import { apiUrl, fetchJson, fetchUnit, runApiEffect } from "@/api/effect/api-client";
import { animeKeys } from "./keys";
import { useTriggerTaskMutation } from "./trigger-task";

export function downloadQueueQueryOptions() {
  return queryOptions({
    queryKey: animeKeys.downloads.queue(),
    queryFn: ({ signal }) =>
      runApiEffect(
        fetchJson(
          Schema.mutable(Schema.Array(DownloadStatusSchema)),
          `${API_BASE}/downloads/queue`,
          undefined,
          signal,
        ),
      ),
    refetchInterval: 5000,
  });
}

export function downloadHistoryQueryOptions() {
  return queryOptions({
    queryKey: animeKeys.downloads.history(),
    queryFn: ({ signal }) =>
      runApiEffect(
        fetchJson(
          Schema.mutable(Schema.Array(DownloadSchema)),
          `${API_BASE}/downloads/history`,
          undefined,
          signal,
        ),
      ),
    staleTime: 1000 * 60,
  });
}

export function useSearchMissingMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (mediaId?: number) =>
      runApiEffect(
        fetchJson(AsyncOperationAcceptedSchema, `${API_BASE}/downloads/search-missing`, {
          method: "POST",
          body: { media_id: mediaId },
        }),
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: animeKeys.downloads.all });
      void queryClient.invalidateQueries({ queryKey: animeKeys.system.tasks.all() });
    },
  });
}

function invalidateDownloadQueries(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: animeKeys.downloads.queue() });
  void queryClient.invalidateQueries({ queryKey: animeKeys.downloads.history() });
}

export function usePauseDownloadMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (downloadId: number) =>
      runApiEffect(fetchUnit(`${API_BASE}/downloads/${downloadId}/pause`, { method: "POST" })),
    onSuccess: () => {
      invalidateDownloadQueries(queryClient);
    },
  });
}

export function useResumeDownloadMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (downloadId: number) =>
      runApiEffect(
        fetchUnit(`${API_BASE}/downloads/${downloadId}/resume`, {
          method: "POST",
        }),
      ),
    onSuccess: () => {
      invalidateDownloadQueries(queryClient);
    },
  });
}

export function useRetryDownloadMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (downloadId: number) =>
      runApiEffect(fetchUnit(`${API_BASE}/downloads/${downloadId}/retry`, { method: "POST" })),
    onSuccess: () => {
      invalidateDownloadQueries(queryClient);
    },
  });
}

export function useDeleteDownloadMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { downloadId: number; deleteFiles?: boolean }) =>
      runApiEffect(
        fetchUnit(
          apiUrl(`/downloads/${input.downloadId}`, { delete_files: Boolean(input.deleteFiles) }),
          { method: "DELETE" },
        ),
      ),
    onSuccess: () => {
      invalidateDownloadQueries(queryClient);
    },
  });
}

export function useSyncDownloadsMutation() {
  return useTriggerTaskMutation({
    endpoint: () => "/downloads/sync",
    invalidate: () => [animeKeys.downloads.all],
  });
}

export function useReconcileDownloadMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (downloadId: number) =>
      runApiEffect(
        fetchUnit(`${API_BASE}/downloads/${downloadId}/reconcile`, {
          method: "POST",
        }),
      ),
    onSuccess: () => {
      invalidateDownloadQueries(queryClient);
    },
  });
}
