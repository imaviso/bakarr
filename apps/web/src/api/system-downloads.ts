import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Effect, Schema } from "effect";
import { AsyncOperationAcceptedSchema, DownloadSchema, DownloadStatusSchema } from "@bakarr/shared";
import { API_BASE } from "~/api/constants";
import { fetchJson, fetchUnit } from "~/api/effect/api-client";
import { animeKeys } from "./keys";

export function downloadQueueQueryOptions() {
  return queryOptions({
    queryKey: animeKeys.downloads.queue(),
    queryFn: ({ signal }) =>
      Effect.runPromise(
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

export function useDownloadQueueQuery() {
  return useQuery(downloadQueueQueryOptions());
}

export function downloadHistoryQueryOptions() {
  return queryOptions({
    queryKey: animeKeys.downloads.history(),
    queryFn: ({ signal }) =>
      Effect.runPromise(
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

export function useDownloadHistoryQuery() {
  return useQuery(downloadHistoryQueryOptions());
}

export function useSearchMissingMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (animeId?: number) =>
      Effect.runPromise(
        fetchJson(AsyncOperationAcceptedSchema, `${API_BASE}/downloads/search-missing`, {
          method: "POST",
          body: { anime_id: animeId },
        }),
      ),
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

export function usePauseDownloadMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (downloadId: number) =>
      Effect.runPromise(fetchUnit(`${API_BASE}/downloads/${downloadId}/pause`, { method: "POST" })),
    onSuccess: () => {
      invalidateDownloadQueries(queryClient);
    },
  });
}

export function useResumeDownloadMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (downloadId: number) =>
      Effect.runPromise(
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
      Effect.runPromise(fetchUnit(`${API_BASE}/downloads/${downloadId}/retry`, { method: "POST" })),
    onSuccess: () => {
      invalidateDownloadQueries(queryClient);
    },
  });
}

export function useDeleteDownloadMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { downloadId: number; deleteFiles?: boolean }) =>
      Effect.runPromise(
        fetchUnit(
          `${API_BASE}/downloads/${input.downloadId}?delete_files=${
            input.deleteFiles ? "true" : "false"
          }`,
          { method: "DELETE" },
        ),
      ),
    onSuccess: () => {
      invalidateDownloadQueries(queryClient);
    },
  });
}

export function useSyncDownloadsMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      Effect.runPromise(
        fetchJson(AsyncOperationAcceptedSchema, `${API_BASE}/downloads/sync`, { method: "POST" }),
      ),
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

export function useReconcileDownloadMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (downloadId: number) =>
      Effect.runPromise(
        fetchUnit(`${API_BASE}/downloads/${downloadId}/reconcile`, {
          method: "POST",
        }),
      ),
    onSuccess: () => {
      invalidateDownloadQueries(queryClient);
    },
  });
}
