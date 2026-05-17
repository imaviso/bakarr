import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { AddAnimeRequest, Media, SearchDownloadRequest } from "./contracts";
import { MediaSchema, AsyncOperationAcceptedSchema } from "@bakarr/shared";
import { Effect } from "effect";
import { API_BASE } from "~/api/constants";
import { fetchJson, fetchUnit } from "~/api/effect/api-client";
import { animeKeys } from "./keys";

export function useAddMediaMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: AddAnimeRequest) =>
      Effect.runPromise(
        fetchJson(MediaSchema, `${API_BASE}/media`, {
          method: "POST",
          body: data,
        }),
      ),
    onSuccess: (newAnime) => {
      queryClient.setQueryData<Media[]>(animeKeys.lists(), (old) => {
        if (!old) return [newAnime];
        return [...old, newAnime].toSorted((a, b) => a.title.romaji.localeCompare(b.title.romaji));
      });
      void queryClient.invalidateQueries({ queryKey: animeKeys.system.status() });
    },
  });
}

export function useDeleteMediaMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      Effect.runPromise(fetchUnit(`${API_BASE}/media/${id}`, { method: "DELETE" })),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: animeKeys.lists() });
      void queryClient.invalidateQueries({ queryKey: animeKeys.system.status() });
    },
  });
}

export function useToggleMonitorMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, monitored }: { id: number; monitored: boolean }) =>
      Effect.runPromise(
        fetchUnit(`${API_BASE}/media/${id}/monitor`, {
          method: "POST",
          body: { monitored },
        }),
      ),
    onMutate: async ({ id, monitored }) => {
      await queryClient.cancelQueries({ queryKey: animeKeys.detail(id) });
      await queryClient.cancelQueries({ queryKey: animeKeys.lists() });

      const previousAnime = queryClient.getQueryData<Media>(animeKeys.detail(id));
      const previousList = queryClient.getQueryData<Media[]>(animeKeys.lists());

      if (previousAnime) {
        queryClient.setQueryData<Media>(animeKeys.detail(id), {
          ...previousAnime,
          monitored,
        });
      }

      if (previousList) {
        queryClient.setQueryData<Media[]>(
          animeKeys.lists(),
          previousList.map((a) => (a.id === id ? { ...a, monitored } : a)),
        );
      }

      return { previousAnime, previousList };
    },
    onError: (_err, { id }, context) => {
      if (context?.previousAnime) {
        queryClient.setQueryData(animeKeys.detail(id), context.previousAnime);
      }
      if (context?.previousList) {
        queryClient.setQueryData(animeKeys.lists(), context.previousList);
      }
    },
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
      Effect.runPromise(
        fetchUnit(`${API_BASE}/media/${id}/path`, {
          method: "PUT",
          body: { path, rescan },
        }),
      ),
    onMutate: async ({ id, path }) => {
      await queryClient.cancelQueries({ queryKey: animeKeys.detail(id) });
      const previousAnime = queryClient.getQueryData<Media>(animeKeys.detail(id));
      if (previousAnime) {
        queryClient.setQueryData<Media>(animeKeys.detail(id), {
          ...previousAnime,
          root_folder: path,
        });
      }
      return { previousAnime };
    },
    onError: (_err, { id }, context) => {
      if (context?.previousAnime) {
        queryClient.setQueryData(animeKeys.detail(id), context.previousAnime);
      }
    },
    onSettled: (_, __, { id }) => {
      void queryClient.invalidateQueries({ queryKey: animeKeys.detail(id) });
    },
  });
}

export function useUpdateMediaProfileMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, profileName }: { id: number; profileName: string }) =>
      Effect.runPromise(
        fetchUnit(`${API_BASE}/media/${id}/profile`, {
          method: "PUT",
          body: { profile_name: profileName },
        }),
      ),
    onMutate: async ({ id, profileName }) => {
      await queryClient.cancelQueries({ queryKey: animeKeys.detail(id) });
      const previousAnime = queryClient.getQueryData<Media>(animeKeys.detail(id));
      if (previousAnime) {
        queryClient.setQueryData<Media>(animeKeys.detail(id), {
          ...previousAnime,
          profile_name: profileName,
        });
      }
      return { previousAnime };
    },
    onError: (_err, { id }, context) => {
      if (context?.previousAnime) {
        queryClient.setQueryData(animeKeys.detail(id), context.previousAnime);
      }
    },
    onSettled: (_, __, { id }) => {
      void queryClient.invalidateQueries({ queryKey: animeKeys.detail(id) });
    },
  });
}

export function useUpdateMediaReleaseProfilesMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, releaseProfileIds }: { id: number; releaseProfileIds: number[] }) =>
      Effect.runPromise(
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
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (mediaId: number) =>
      Effect.runPromise(
        fetchJson(AsyncOperationAcceptedSchema, `${API_BASE}/media/${mediaId}/units/refresh`, {
          method: "POST",
        }),
      ),
    onSuccess: (accepted, mediaId) => {
      toast.info(accepted.message);
      void queryClient.invalidateQueries({ queryKey: animeKeys.detail(mediaId) });
      void queryClient.invalidateQueries({ queryKey: animeKeys.units(mediaId) });
      void queryClient.invalidateQueries({ queryKey: animeKeys.lists() });
      void queryClient.invalidateQueries({ queryKey: animeKeys.system.tasks.all() });
      if (accepted.task_id !== undefined) {
        void queryClient.invalidateQueries({
          queryKey: animeKeys.system.tasks.byId(accepted.task_id),
        });
      }
    },
  });
}

export function useScanFolderMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (mediaId: number) =>
      Effect.runPromise(
        fetchJson(AsyncOperationAcceptedSchema, `${API_BASE}/media/${mediaId}/units/scan`, {
          method: "POST",
        }),
      ),
    onSuccess: (accepted, mediaId) => {
      toast.info(accepted.message);
      void queryClient.invalidateQueries({ queryKey: animeKeys.units(mediaId) });
      void queryClient.invalidateQueries({ queryKey: animeKeys.detail(mediaId) });
      void queryClient.invalidateQueries({ queryKey: animeKeys.lists() });
      void queryClient.invalidateQueries({ queryKey: animeKeys.unitScanTasks.all(mediaId) });
      if (accepted.task_id !== undefined) {
        void queryClient.invalidateQueries({
          queryKey: animeKeys.unitScanTasks.byId(mediaId, accepted.task_id),
        });
      }
    },
  });
}

export function useDeleteUnitFileMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ mediaId, unitNumber }: { mediaId: number; unitNumber: number }) =>
      Effect.runPromise(
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
      Effect.runPromise(
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
      Effect.runPromise(
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
      Effect.runPromise(
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
