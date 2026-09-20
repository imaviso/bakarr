import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { AddAnimeRequest, SearchDownloadRequest } from "./contracts";
import { MediaSchema } from "@bakarr/shared";
import { API_BASE } from "@/api/constants";
import { fetchJson, fetchUnit, runApiEffect } from "@/api/effect/api-client";
import { animeKeys } from "./keys";
import { useTriggerTaskMutation } from "./trigger-task";

export function useAddMediaMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: AddAnimeRequest) =>
      runApiEffect(
        fetchJson(MediaSchema, `${API_BASE}/media`, {
          method: "POST",
          body: data,
        }),
      ),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: animeKeys.lists() });
      void queryClient.invalidateQueries({ queryKey: animeKeys.system.status() });
    },
  });
}

export function useDeleteMediaMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      runApiEffect(fetchUnit(`${API_BASE}/media/${id}`, { method: "DELETE" })),
    onSettled: (_data, _error, id) => {
      queryClient.removeQueries({ queryKey: animeKeys.detail(id) });
      void queryClient.invalidateQueries({ queryKey: animeKeys.lists() });
      void queryClient.invalidateQueries({ queryKey: animeKeys.system.status() });
    },
  });
}

export function useToggleMonitorMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, monitored }: { id: number; monitored: boolean }) =>
      runApiEffect(
        fetchUnit(`${API_BASE}/media/${id}/monitor`, {
          method: "POST",
          body: { monitored },
        }),
      ),
    onSettled: (_, __, { id }) => {
      void queryClient.invalidateQueries({ queryKey: animeKeys.detail(id) });
      void queryClient.invalidateQueries({ queryKey: animeKeys.lists() });
    },
  });
}

export function useUpdateMediaPathMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, path, rescan }: { id: number; path: string; rescan?: boolean }) =>
      runApiEffect(
        fetchUnit(`${API_BASE}/media/${id}/path`, {
          method: "PUT",
          body: { path, rescan },
        }),
      ),
    onSettled: (_, __, { id }) => {
      void queryClient.invalidateQueries({ queryKey: animeKeys.detail(id) });
    },
  });
}

export function useUpdateMediaProfileMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, profileName }: { id: number; profileName: string }) =>
      runApiEffect(
        fetchUnit(`${API_BASE}/media/${id}/profile`, {
          method: "PUT",
          body: { profile_name: profileName },
        }),
      ),
    onSettled: (_, __, { id }) => {
      void queryClient.invalidateQueries({ queryKey: animeKeys.detail(id) });
    },
  });
}

export function useUpdateMediaReleaseProfilesMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, releaseProfileIds }: { id: number; releaseProfileIds: number[] }) =>
      runApiEffect(
        fetchUnit(`${API_BASE}/media/${id}/release-profiles`, {
          method: "PUT",
          body: { release_profile_ids: releaseProfileIds },
        }),
      ),
    onSuccess: (_, { id }) => {
      void queryClient.invalidateQueries({ queryKey: animeKeys.detail(id) });
    },
  });
}

export function useRefreshUnitsMutation() {
  return useTriggerTaskMutation<number>({
    endpoint: (mediaId) => `/media/${mediaId}/units/refresh`,
    invalidate: (mediaId) => [
      animeKeys.detail(mediaId),
      animeKeys.units(mediaId),
      animeKeys.lists(),
    ],
  });
}

export function useScanFolderMutation() {
  return useTriggerTaskMutation<number>({
    endpoint: (mediaId) => `/media/${mediaId}/units/scan`,
    invalidate: (mediaId) => [
      animeKeys.units(mediaId),
      animeKeys.detail(mediaId),
      animeKeys.files(mediaId),
      animeKeys.unitScanTasks.all(mediaId),
      animeKeys.renamePreview(mediaId),
    ],
    taskKeys: (accepted, mediaId) =>
      accepted.task_id === undefined
        ? []
        : [animeKeys.unitScanTasks.byId(mediaId, accepted.task_id)],
  });
}

export function useDeleteUnitFileMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ mediaId, unitNumber }: { mediaId: number; unitNumber: number }) =>
      runApiEffect(
        fetchUnit(`${API_BASE}/media/${mediaId}/units/${unitNumber}/file`, {
          method: "DELETE",
        }),
      ),
    onSuccess: (_, { mediaId }) => {
      void queryClient.invalidateQueries({ queryKey: animeKeys.units(mediaId) });
    },
  });
}

export function useMapUnitMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      mediaId,
      unitNumber,
      filePath,
    }: {
      mediaId: number;
      unitNumber: number;
      filePath: string;
    }) =>
      runApiEffect(
        fetchUnit(`${API_BASE}/media/${mediaId}/units/${unitNumber}/map`, {
          method: "POST",
          body: { file_path: filePath },
        }),
      ),
    onSuccess: (_, { mediaId }) => {
      void queryClient.invalidateQueries({ queryKey: animeKeys.units(mediaId) });
      void queryClient.invalidateQueries({ queryKey: animeKeys.files(mediaId) });
    },
  });
}

export function useBulkMapUnitsMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      mediaId,
      mappings,
    }: {
      mediaId: number;
      mappings: { unit_number: number; file_path: string }[];
    }) =>
      runApiEffect(
        fetchUnit(`${API_BASE}/media/${mediaId}/units/map/bulk`, {
          method: "POST",
          body: { mappings },
        }),
      ),
    onSuccess: (_, { mediaId }) => {
      void queryClient.invalidateQueries({ queryKey: animeKeys.units(mediaId) });
      void queryClient.invalidateQueries({ queryKey: animeKeys.files(mediaId) });
    },
  });
}

export function useGrabReleaseMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: SearchDownloadRequest) =>
      runApiEffect(
        fetchUnit(`${API_BASE}/search/download`, {
          method: "POST",
          body: data,
        }),
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: animeKeys.downloads.queue() });
      void queryClient.invalidateQueries({
        queryKey: animeKeys.downloads.history(),
      });
      void queryClient.invalidateQueries({ queryKey: animeKeys.library.activity() });
    },
  });
}
