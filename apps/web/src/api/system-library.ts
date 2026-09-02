import { keepPreviousData, queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  BulkUnmappedFolderControlRequest,
  ImportCandidateSelectionRequest,
  ImportFileRequest,
  UnmappedFolderControlRequest,
  UnmappedFolderImportRequest,
} from "./contracts";
import {
  BrowseResultSchema,
  ImportCandidateSelectionResultSchema,
  ScanResultSchema,
  ScannerStateSchema,
} from "@bakarr/shared";
import { API_BASE } from "@/api/constants";
import { fetchJson, fetchUnit, runApiEffect } from "@/api/effect/api-client";
import { animeKeys } from "./keys";
import { useTriggerTaskMutation } from "./trigger-task";

export function unmappedFoldersQueryOptions() {
  return queryOptions({
    queryKey: animeKeys.library.unmapped(),
    queryFn: ({ signal }) =>
      runApiEffect(
        fetchJson(ScannerStateSchema, `${API_BASE}/library/unmapped`, undefined, signal),
      ),
    refetchInterval: (query) =>
      query.state.data?.is_scanning || query.state.data?.has_outstanding_matches ? 1000 : false,
  });
}

export function useScanLibraryMutation() {
  return useTriggerTaskMutation({
    endpoint: () => "/library/unmapped/scan",
    invalidate: () => [animeKeys.library.unmapped(), animeKeys.system.jobs()],
  });
}

export function useControlUnmappedFolderMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: UnmappedFolderControlRequest) =>
      runApiEffect(
        fetchUnit(`${API_BASE}/library/unmapped/control`, {
          method: "POST",
          body: data,
        }),
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: animeKeys.library.unmapped() });
      void queryClient.invalidateQueries({ queryKey: animeKeys.system.jobs() });
    },
  });
}

export function useBulkControlUnmappedFoldersMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: BulkUnmappedFolderControlRequest) =>
      runApiEffect(
        fetchUnit(`${API_BASE}/library/unmapped/control/bulk`, {
          method: "POST",
          body: data,
        }),
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: animeKeys.library.unmapped() });
      void queryClient.invalidateQueries({ queryKey: animeKeys.system.jobs() });
    },
  });
}

export function useImportUnmappedFolderMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: UnmappedFolderImportRequest) =>
      runApiEffect(
        fetchUnit(`${API_BASE}/library/unmapped/import`, {
          method: "POST",
          body: data,
        }),
      ),
    onSuccess: (_, variables) => {
      void queryClient.invalidateQueries({ queryKey: animeKeys.library.unmapped() });
      void queryClient.invalidateQueries({ queryKey: animeKeys.lists() });
      void queryClient.invalidateQueries({
        queryKey: animeKeys.detail(variables.media_id),
      });
      void queryClient.invalidateQueries({
        queryKey: animeKeys.units(variables.media_id),
      });
      void queryClient.invalidateQueries({ queryKey: animeKeys.system.status() });
    },
  });
}

/**
 * Read-only dry run: the backend scans a path and returns a preview of what
 * an import would do (files, candidates, skips) without importing anything.
 * The result lives in mutation state (`scanMutation.data`), not the query
 * cache, so no invalidation is needed.
 */
export function usePreviewImportPathMutation() {
  return useMutation({
    mutationFn: (data: { path: string; media_id?: number }) =>
      runApiEffect(
        fetchJson(ScanResultSchema, `${API_BASE}/library/import/scan`, {
          method: "POST",
          body: data,
        }),
      ),
  });
}

export function useImportFilesMutation() {
  return useTriggerTaskMutation<ImportFileRequest[]>({
    endpoint: () => "/library/import",
    body: (files) => ({ files }),
    invalidate: () => [
      animeKeys.lists(),
      animeKeys.library.all,
      animeKeys.system.status(),
      animeKeys.library.importTasks.all(),
    ],
    taskKeys: (accepted) =>
      accepted.task_id === undefined ? [] : [animeKeys.library.importTasks.byId(accepted.task_id)],
  });
}

/**
 * Read-only: the backend computes a preview of the next import selection
 * (candidate toggles) from the posted files. The result feeds local reducer
 * state via `mutate` callbacks, not the query cache, so no invalidation is
 * needed.
 */
export function usePreviewImportSelectionMutation() {
  return useMutation({
    mutationFn: (data: ImportCandidateSelectionRequest) =>
      runApiEffect(
        fetchJson(ImportCandidateSelectionResultSchema, `${API_BASE}/library/import/selection`, {
          method: "POST",
          body: data,
        }),
      ),
  });
}

export function browsePathQueryOptions(
  path: string,
  pagination?: { limit: number; offset: number },
) {
  const params = new URLSearchParams({ path });
  if (pagination) {
    params.set("limit", String(pagination.limit));
    if (pagination.offset) params.set("offset", String(pagination.offset));
  }
  return queryOptions({
    queryKey: animeKeys.browse(path, pagination?.offset, pagination?.limit),
    queryFn: ({ signal }) =>
      runApiEffect(
        fetchJson(
          BrowseResultSchema,
          `${API_BASE}/library/browse?${params.toString()}`,
          undefined,
          signal,
        ),
      ),
    placeholderData: keepPreviousData,
    staleTime: 1000 * 60 * 60,
  });
}
