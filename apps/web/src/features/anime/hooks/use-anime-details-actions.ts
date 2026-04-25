import {
  createDeleteAnimeMutation,
  createDeleteEpisodeFileMutation,
  createRefreshEpisodesMutation,
  createScanFolderMutation,
  createToggleMonitorMutation,
  createUpdateAnimePathMutation,
  createUpdateAnimeProfileMutation,
  createUpdateAnimeReleaseProfilesMutation,
} from "~/api/anime-mutations";
import { createSearchMissingMutation } from "~/api/system-downloads";
import { createAnimeEpisodeStreamUrlMutation } from "~/api/auth";
import { Effect } from "effect";
import { useState } from "react";
import { toast } from "sonner";
import { errorMessage } from "~/api/effect/errors";
import { copyToClipboard } from "~/infra/utils";

interface UseAnimeDetailsActionsOptions {
  animeId: number;
}

export function useAnimeDetailsActions(options: UseAnimeDetailsActionsOptions) {
  const deleteAnime = createDeleteAnimeMutation();
  const refreshEpisodes = createRefreshEpisodesMutation();
  const scanFolder = createScanFolderMutation();
  const searchMissing = createSearchMissingMutation();
  const toggleMonitor = createToggleMonitorMutation();
  const deleteEpisodeFile = createDeleteEpisodeFileMutation();
  const updatePath = createUpdateAnimePathMutation();
  const updateProfile = createUpdateAnimeProfileMutation();
  const updateReleaseProfiles = createUpdateAnimeReleaseProfilesMutation();
  const streamUrl = createAnimeEpisodeStreamUrlMutation();
  const [latestScanTaskId, setLatestScanTaskId] = useState<number | undefined>(undefined);

  const handlePlayInMpv = (episodeNumber: number) => {
    streamUrl.mutate(
      { animeId: options.animeId, episodeNumber },
      {
        onError: (err) => {
          toast.error(errorMessage(err, "Failed to get stream URL"));
        },
        onSuccess: ({ url }) => {
          const origin = globalThis.location.origin;
          globalThis.open(`mpv://${origin}${url}`, "_self");
        },
      },
    );
  };

  const handleCopyStreamLink = (episodeNumber: number) => {
    streamUrl.mutate(
      { animeId: options.animeId, episodeNumber },
      {
        onError: (err) => {
          toast.error(errorMessage(err, "Failed to copy link"));
        },
        onSuccess: ({ url }) => {
          const origin = globalThis.location.origin;
          void Effect.runPromise(
            copyToClipboard(`${origin}${url}`).pipe(
              Effect.match({
                onFailure: (err) => {
                  toast.error(errorMessage(err, "Failed to copy link"));
                },
                onSuccess: () => {
                  toast.success("Link copied to clipboard");
                },
              }),
            ),
          );
        },
      },
    );
  };

  const handleToggleMonitor = (isMonitored: boolean) => {
    toggleMonitor.mutate({
      id: options.animeId,
      monitored: !isMonitored,
    });
  };

  const handleRefreshEpisodes = () => {
    refreshEpisodes.mutate(options.animeId);
  };

  const handleSearchMissing = () => {
    searchMissing.mutate(options.animeId);
  };

  const handleScanFolder = () => {
    scanFolder.mutate(options.animeId, {
      onSuccess: (accepted) => {
        setLatestScanTaskId(accepted.task_id);
      },
    });
  };

  const handleDeleteAnime = (onSuccess: () => void) => {
    deleteAnime.mutate(options.animeId, { onSuccess });
  };

  const handleDeleteEpisodeFile = (episodeNumber: number) => {
    deleteEpisodeFile.mutate({
      animeId: options.animeId,
      episodeNumber,
    });
  };

  return {
    handleCopyStreamLink,
    handleDeleteAnime,
    handleDeleteEpisodeFile,
    handlePlayInMpv,
    handleRefreshEpisodes,
    handleScanFolder,
    handleSearchMissing,
    handleToggleMonitor,
    isRefreshPending: refreshEpisodes.isPending,
    isScanFolderPending: scanFolder.isPending,
    isSearchMissingPending: searchMissing.isPending,
    isToggleMonitorPending: toggleMonitor.isPending,
    latestScanTaskId,
    isUpdatingPath: updatePath.isPending,
    isUpdatingProfile: updateProfile.isPending,
    isUpdatingReleaseProfiles: updateReleaseProfiles.isPending,
    updatePath: updatePath.mutateAsync,
    updateProfile: updateProfile.mutateAsync,
    updateReleaseProfiles: updateReleaseProfiles.mutateAsync,
  };
}
