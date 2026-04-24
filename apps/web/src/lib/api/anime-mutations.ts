import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { AddAnimeRequest, Anime, SearchDownloadRequest } from "./contracts";
import { AnimeSchema, AsyncOperationAcceptedSchema } from "@bakarr/shared";
import { Effect } from "effect";
import { API_BASE } from "~/lib/api";
import { fetchJson, fetchUnit } from "~/lib/effect/api-client";
import { animeKeys } from "./keys";

export function createAddAnimeMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: AddAnimeRequest) =>
      Effect.runPromise(
        fetchJson(AnimeSchema, `${API_BASE}/anime`, {
          method: "POST",
          body: JSON.stringify(data),
        }),
      ),
    onSuccess: (newAnime) => {
      queryClient.setQueryData<Anime[]>(animeKeys.lists(), (old) => {
        if (!old) return [newAnime];
        return [...old, newAnime].toSorted((a, b) => a.title.romaji.localeCompare(b.title.romaji));
      });
      void queryClient.invalidateQueries({ queryKey: animeKeys.system.status() });
    },
  });
}

export function createDeleteAnimeMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      Effect.runPromise(fetchUnit(`${API_BASE}/anime/${id}`, { method: "DELETE" })),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: animeKeys.lists() });
      void queryClient.invalidateQueries({ queryKey: animeKeys.system.status() });
    },
  });
}

export function createToggleMonitorMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, monitored }: { id: number; monitored: boolean }) =>
      Effect.runPromise(
        fetchUnit(`${API_BASE}/anime/${id}/monitor`, {
          method: "POST",
          body: JSON.stringify({ monitored }),
        }),
      ),
    onMutate: async ({ id, monitored }) => {
      await queryClient.cancelQueries({ queryKey: animeKeys.detail(id) });
      await queryClient.cancelQueries({ queryKey: animeKeys.lists() });

      const previousAnime = queryClient.getQueryData<Anime>(animeKeys.detail(id));
      const previousList = queryClient.getQueryData<Anime[]>(animeKeys.lists());

      if (previousAnime) {
        queryClient.setQueryData<Anime>(animeKeys.detail(id), {
          ...previousAnime,
          monitored,
        });
      }

      if (previousList) {
        queryClient.setQueryData<Anime[]>(
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

export function createUpdateAnimePathMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, path, rescan }: { id: number; path: string; rescan?: boolean }) =>
      Effect.runPromise(
        fetchUnit(`${API_BASE}/anime/${id}/path`, {
          method: "PUT",
          body: JSON.stringify({ path, rescan }),
        }),
      ),
    onMutate: async ({ id, path }) => {
      await queryClient.cancelQueries({ queryKey: animeKeys.detail(id) });
      const previousAnime = queryClient.getQueryData<Anime>(animeKeys.detail(id));
      if (previousAnime) {
        queryClient.setQueryData<Anime>(animeKeys.detail(id), {
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

export function createUpdateAnimeProfileMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, profileName }: { id: number; profileName: string }) =>
      Effect.runPromise(
        fetchUnit(`${API_BASE}/anime/${id}/profile`, {
          method: "PUT",
          body: JSON.stringify({ profile_name: profileName }),
        }),
      ),
    onMutate: async ({ id, profileName }) => {
      await queryClient.cancelQueries({ queryKey: animeKeys.detail(id) });
      const previousAnime = queryClient.getQueryData<Anime>(animeKeys.detail(id));
      if (previousAnime) {
        queryClient.setQueryData<Anime>(animeKeys.detail(id), {
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

export function createUpdateAnimeReleaseProfilesMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, releaseProfileIds }: { id: number; releaseProfileIds: number[] }) =>
      Effect.runPromise(
        fetchUnit(`${API_BASE}/anime/${id}/release-profiles`, {
          method: "PUT",
          body: JSON.stringify({ release_profile_ids: releaseProfileIds }),
        }),
      ),
    onSuccess: (_, { id }) => {
      void queryClient.invalidateQueries({ queryKey: animeKeys.detail(id) });
    },
  });
}

export function createRefreshEpisodesMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (animeId: number) =>
      Effect.runPromise(
        fetchJson(AsyncOperationAcceptedSchema, `${API_BASE}/anime/${animeId}/episodes/refresh`, {
          method: "POST",
        }),
      ),
    onSuccess: (accepted, animeId) => {
      toast.info(accepted.message);
      void queryClient.invalidateQueries({ queryKey: animeKeys.detail(animeId) });
      void queryClient.invalidateQueries({ queryKey: animeKeys.episodes(animeId) });
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

export function createScanFolderMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (animeId: number) =>
      Effect.runPromise(
        fetchJson(AsyncOperationAcceptedSchema, `${API_BASE}/anime/${animeId}/episodes/scan`, {
          method: "POST",
        }),
      ),
    onSuccess: (accepted, animeId) => {
      toast.info(accepted.message);
      void queryClient.invalidateQueries({ queryKey: animeKeys.episodes(animeId) });
      void queryClient.invalidateQueries({ queryKey: animeKeys.detail(animeId) });
      void queryClient.invalidateQueries({ queryKey: animeKeys.lists() });
      void queryClient.invalidateQueries({ queryKey: animeKeys.episodeScanTasks.all(animeId) });
      if (accepted.task_id !== undefined) {
        void queryClient.invalidateQueries({
          queryKey: animeKeys.episodeScanTasks.byId(animeId, accepted.task_id),
        });
      }
    },
  });
}

export function createDeleteEpisodeFileMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ animeId, episodeNumber }: { animeId: number; episodeNumber: number }) =>
      Effect.runPromise(
        fetchUnit(`${API_BASE}/anime/${animeId}/episodes/${episodeNumber}/file`, {
          method: "DELETE",
        }),
      ),
    onSuccess: (_, { animeId }) => {
      void queryClient.invalidateQueries({ queryKey: animeKeys.episodes(animeId) });
    },
  });
}

export function createMapEpisodeMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      animeId,
      episodeNumber,
      filePath,
    }: {
      animeId: number;
      episodeNumber: number;
      filePath: string;
    }) =>
      Effect.runPromise(
        fetchUnit(`${API_BASE}/anime/${animeId}/episodes/${episodeNumber}/map`, {
          method: "POST",
          body: JSON.stringify({ file_path: filePath }),
        }),
      ),
    onSuccess: (_, { animeId }) => {
      void queryClient.invalidateQueries({ queryKey: animeKeys.episodes(animeId) });
      void queryClient.invalidateQueries({ queryKey: animeKeys.files(animeId) });
    },
  });
}

export function createBulkMapEpisodesMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      animeId,
      mappings,
    }: {
      animeId: number;
      mappings: { episode_number: number; file_path: string }[];
    }) =>
      Effect.runPromise(
        fetchUnit(`${API_BASE}/anime/${animeId}/episodes/map/bulk`, {
          method: "POST",
          body: JSON.stringify({ mappings }),
        }),
      ),
    onSuccess: (_, { animeId }) => {
      void queryClient.invalidateQueries({ queryKey: animeKeys.episodes(animeId) });
      void queryClient.invalidateQueries({ queryKey: animeKeys.files(animeId) });
    },
  });
}

export function createGrabReleaseMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: SearchDownloadRequest) =>
      Effect.runPromise(
        fetchUnit(`${API_BASE}/search/download`, {
          method: "POST",
          body: JSON.stringify(data),
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
