import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { AsyncOperationAccepted, Download, DownloadStatus } from "./contracts";
import { API_BASE, fetchApi } from "./client";
import { animeKeys } from "./keys";

export function downloadQueueQueryOptions() {
  return queryOptions({
    queryKey: animeKeys.downloads.queue(),
    queryFn: ({ signal }) =>
      fetchApi<DownloadStatus[]>(`${API_BASE}/downloads/queue`, undefined, signal),
    refetchInterval: 5000,
  });
}

export function createDownloadQueueQuery() {
  return useQuery(downloadQueueQueryOptions());
}

export function downloadHistoryQueryOptions() {
  return queryOptions({
    queryKey: animeKeys.downloads.history(),
    queryFn: ({ signal }) =>
      fetchApi<Download[]>(`${API_BASE}/downloads/history`, undefined, signal),
    staleTime: 1000 * 60,
  });
}

export function createDownloadHistoryQuery() {
  return useQuery(downloadHistoryQueryOptions());
}

export function createSearchMissingMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (animeId?: number) =>
      fetchApi<AsyncOperationAccepted>(`${API_BASE}/downloads/search-missing`, {
        method: "POST",
        body: JSON.stringify({ anime_id: animeId }),
      }),
    onSuccess: (accepted) => {
      toast.info(accepted.message);
      void queryClient.invalidateQueries({ queryKey: animeKeys.downloads.all });
      void queryClient.invalidateQueries({ queryKey: animeKeys.system.tasks.all() });
      void queryClient.invalidateQueries({
        queryKey: animeKeys.system.tasks.byId(accepted.task_id),
      });
    },
  });
}

function invalidateDownloadQueries(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: animeKeys.downloads.all });
  void queryClient.invalidateQueries({ queryKey: animeKeys.system.all });
}

export function createPauseDownloadMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (downloadId: number) =>
      fetchApi(`${API_BASE}/downloads/${downloadId}/pause`, { method: "POST" }),
    onSuccess: () => {
      invalidateDownloadQueries(queryClient);
    },
  });
}

export function createResumeDownloadMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (downloadId: number) =>
      fetchApi(`${API_BASE}/downloads/${downloadId}/resume`, {
        method: "POST",
      }),
    onSuccess: () => {
      invalidateDownloadQueries(queryClient);
    },
  });
}

export function createRetryDownloadMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (downloadId: number) =>
      fetchApi(`${API_BASE}/downloads/${downloadId}/retry`, { method: "POST" }),
    onSuccess: () => {
      invalidateDownloadQueries(queryClient);
    },
  });
}

export function createDeleteDownloadMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { downloadId: number; deleteFiles?: boolean }) =>
      fetchApi(
        `${API_BASE}/downloads/${input.downloadId}?delete_files=${
          input.deleteFiles ? "true" : "false"
        }`,
        { method: "DELETE" },
      ),
    onSuccess: () => {
      invalidateDownloadQueries(queryClient);
    },
  });
}

export function createSyncDownloadsMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      fetchApi<AsyncOperationAccepted>(`${API_BASE}/downloads/sync`, { method: "POST" }),
    onSuccess: (accepted) => {
      toast.info(accepted.message);
      invalidateDownloadQueries(queryClient);
      void queryClient.invalidateQueries({ queryKey: animeKeys.system.tasks.all() });
      void queryClient.invalidateQueries({
        queryKey: animeKeys.system.tasks.byId(accepted.task_id),
      });
    },
  });
}

export function createReconcileDownloadMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (downloadId: number) =>
      fetchApi(`${API_BASE}/downloads/${downloadId}/reconcile`, {
        method: "POST",
      }),
    onSuccess: () => {
      invalidateDownloadQueries(queryClient);
    },
  });
}
