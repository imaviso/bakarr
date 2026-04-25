import {
  keepPreviousData,
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";
import type {
  BulkUnmappedFolderControlRequest,
  ImportCandidateSelectionRequest,
  ImportFileRequest,
  UnmappedFolderControlRequest,
  UnmappedFolderImportRequest,
} from "./contracts";
import { Effect } from "effect";
import {
  AsyncOperationAcceptedSchema,
  BrowseResultSchema,
  ImportCandidateSelectionResultSchema,
  ScanResultSchema,
  ScannerStateSchema,
} from "@bakarr/shared";
import { API_BASE } from "~/api";
import { fetchJson, fetchUnit } from "~/api/effect/api-client";
import { animeKeys } from "./keys";

export function unmappedFoldersQueryOptions() {
  return queryOptions({
    queryKey: animeKeys.library.unmapped(),
    queryFn: ({ signal }) =>
      Effect.runPromise(
        fetchJson(ScannerStateSchema, `${API_BASE}/library/unmapped`, undefined, signal),
      ),
    refetchInterval: (query) =>
      query.state.data?.is_scanning || query.state.data?.has_outstanding_matches ? 1000 : false,
  });
}

export function createUnmappedFoldersQuery() {
  return useQuery(unmappedFoldersQueryOptions());
}

export function createScanLibraryMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      Effect.runPromise(
        fetchJson(AsyncOperationAcceptedSchema, `${API_BASE}/library/unmapped/scan`, {
          method: "POST",
        }),
      ),
    onSuccess: (accepted) => {
      toast.info(accepted.message);
      void queryClient.invalidateQueries({ queryKey: animeKeys.library.unmapped() });
      void queryClient.invalidateQueries({ queryKey: animeKeys.system.jobs() });
      void queryClient.invalidateQueries({ queryKey: animeKeys.system.tasks.all() });
      if (accepted.task_id !== undefined) {
        void queryClient.invalidateQueries({
          queryKey: animeKeys.system.tasks.byId(accepted.task_id),
        });
      }
    },
  });
}

export function createControlUnmappedFolderMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: UnmappedFolderControlRequest) =>
      Effect.runPromise(
        fetchUnit(`${API_BASE}/library/unmapped/control`, {
          method: "POST",
          body: JSON.stringify(data),
        }),
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: animeKeys.library.unmapped() });
      void queryClient.invalidateQueries({ queryKey: animeKeys.system.jobs() });
    },
  });
}

export function createBulkControlUnmappedFoldersMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: BulkUnmappedFolderControlRequest) =>
      Effect.runPromise(
        fetchUnit(`${API_BASE}/library/unmapped/control/bulk`, {
          method: "POST",
          body: JSON.stringify(data),
        }),
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: animeKeys.library.unmapped() });
      void queryClient.invalidateQueries({ queryKey: animeKeys.system.jobs() });
    },
  });
}

export function createImportUnmappedFolderMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: UnmappedFolderImportRequest) =>
      Effect.runPromise(
        fetchUnit(`${API_BASE}/library/unmapped/import`, {
          method: "POST",
          body: JSON.stringify(data),
        }),
      ),
    onSuccess: (_, variables) => {
      void queryClient.invalidateQueries({ queryKey: animeKeys.library.unmapped() });
      void queryClient.invalidateQueries({ queryKey: animeKeys.lists() });
      void queryClient.invalidateQueries({
        queryKey: animeKeys.detail(variables.anime_id),
      });
      void queryClient.invalidateQueries({
        queryKey: animeKeys.episodes(variables.anime_id),
      });
      void queryClient.invalidateQueries({ queryKey: animeKeys.system.status() });
    },
  });
}

export function createScanImportPathMutation() {
  return useMutation({
    mutationFn: (data: { path: string; anime_id?: number }) =>
      Effect.runPromise(
        fetchJson(ScanResultSchema, `${API_BASE}/library/import/scan`, {
          method: "POST",
          body: JSON.stringify(data),
        }),
      ),
  });
}

export function createImportFilesMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (files: ImportFileRequest[]) =>
      Effect.runPromise(
        fetchJson(AsyncOperationAcceptedSchema, `${API_BASE}/library/import`, {
          method: "POST",
          body: JSON.stringify({ files }),
        }),
      ),
    onSuccess: (accepted) => {
      toast.info(accepted.message);
      void queryClient.invalidateQueries({ queryKey: animeKeys.lists() });
      void queryClient.invalidateQueries({ queryKey: animeKeys.library.all });
      void queryClient.invalidateQueries({ queryKey: animeKeys.system.status() });
      void queryClient.invalidateQueries({ queryKey: animeKeys.library.importTasks.all() });
      if (accepted.task_id !== undefined) {
        void queryClient.invalidateQueries({
          queryKey: animeKeys.library.importTasks.byId(accepted.task_id),
        });
      }
    },
  });
}

export function createImportCandidateSelectionMutation() {
  return useMutation({
    mutationFn: (data: ImportCandidateSelectionRequest) =>
      Effect.runPromise(
        fetchJson(ImportCandidateSelectionResultSchema, `${API_BASE}/library/import/selection`, {
          method: "POST",
          body: JSON.stringify(data),
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
      Effect.runPromise(
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

export function createBrowsePathQuery(
  path: string,
  pagination?: { limit: number; offset: number },
) {
  return useQuery({
    ...browsePathQueryOptions(path, pagination),
  });
}
