import {
  keepPreviousData,
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/solid-query";
import type {
  BrowseResult,
  BulkUnmappedFolderControlRequest,
  ImportCandidateSelectionRequest,
  ImportCandidateSelectionResult,
  ImportFileRequest,
  ImportResult,
  ScannerState,
  ScanResult,
  UnmappedFolderControlRequest,
  UnmappedFolderImportRequest,
} from "./contracts";
import { API_BASE, fetchApi } from "./client";
import { animeKeys } from "./keys";

export function unmappedFoldersQueryOptions() {
  return queryOptions({
    queryKey: animeKeys.library.unmapped(),
    queryFn: ({ signal }) =>
      fetchApi<ScannerState>(`${API_BASE}/library/unmapped`, undefined, signal),
    refetchInterval: (query) =>
      query.state.data?.is_scanning || query.state.data?.has_outstanding_matches ? 1000 : false,
  });
}

export function createUnmappedFoldersQuery() {
  return useQuery(unmappedFoldersQueryOptions);
}

export function createScanLibraryMutation() {
  const queryClient = useQueryClient();
  return useMutation(() => ({
    mutationFn: () => fetchApi(`${API_BASE}/library/unmapped/scan`, { method: "POST" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: animeKeys.library.unmapped() });
      void queryClient.invalidateQueries({ queryKey: animeKeys.system.jobs() });
    },
  }));
}

export function createControlUnmappedFolderMutation() {
  const queryClient = useQueryClient();
  return useMutation(() => ({
    mutationFn: (data: UnmappedFolderControlRequest) =>
      fetchApi(`${API_BASE}/library/unmapped/control`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: animeKeys.library.unmapped() });
      void queryClient.invalidateQueries({ queryKey: animeKeys.system.jobs() });
    },
  }));
}

export function createBulkControlUnmappedFoldersMutation() {
  const queryClient = useQueryClient();
  return useMutation(() => ({
    mutationFn: (data: BulkUnmappedFolderControlRequest) =>
      fetchApi(`${API_BASE}/library/unmapped/control/bulk`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: animeKeys.library.unmapped() });
      void queryClient.invalidateQueries({ queryKey: animeKeys.system.jobs() });
    },
  }));
}

export function createImportUnmappedFolderMutation() {
  const queryClient = useQueryClient();
  return useMutation(() => ({
    mutationFn: (data: UnmappedFolderImportRequest) =>
      fetchApi(`${API_BASE}/library/unmapped/import`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
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
  }));
}

export function createScanImportPathMutation() {
  return useMutation(() => ({
    mutationFn: (data: { path: string; anime_id?: number }) =>
      fetchApi<ScanResult>(`${API_BASE}/library/import/scan`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
  }));
}

export function createImportFilesMutation() {
  const queryClient = useQueryClient();
  return useMutation(() => ({
    mutationFn: (files: ImportFileRequest[]) =>
      fetchApi<ImportResult>(`${API_BASE}/library/import`, {
        method: "POST",
        body: JSON.stringify({ files }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: animeKeys.lists() });
      void queryClient.invalidateQueries({ queryKey: animeKeys.library.all });
      void queryClient.invalidateQueries({ queryKey: animeKeys.system.status() });
    },
  }));
}

export function createImportCandidateSelectionMutation() {
  return useMutation(() => ({
    mutationFn: (data: ImportCandidateSelectionRequest) =>
      fetchApi<ImportCandidateSelectionResult>(`${API_BASE}/library/import/selection`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
  }));
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
      fetchApi<BrowseResult>(`${API_BASE}/library/browse?${params.toString()}`, undefined, signal),
    placeholderData: keepPreviousData,
    staleTime: 1000 * 60 * 60,
  });
}

export function createBrowsePathQuery(
  path: () => string,
  pagination?: () => { limit: number; offset: number },
) {
  return useQuery(() => ({
    ...browsePathQueryOptions(path(), pagination?.()),
  }));
}
