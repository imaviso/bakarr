import {
  createDeleteAnimeMutation,
  createDeleteEpisodeFileMutation,
  createRefreshEpisodesMutation,
  createScanFolderMutation,
  createSearchMissingMutation,
  createToggleMonitorMutation,
  createUpdateAnimePathMutation,
  createUpdateAnimeProfileMutation,
  createUpdateAnimeReleaseProfilesMutation,
  getAnimeEpisodeStreamUrl,
} from "~/lib/api";
import { useState } from "react";
import { toast } from "sonner";
import { copyToClipboard } from "~/lib/utils";

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
  const [latestScanTaskId, setLatestScanTaskId] = useState<number | undefined>(undefined);

  const handlePlayInMpv = (episodeNumber: number) => {
    getAnimeEpisodeStreamUrl(options.animeId, episodeNumber)
      .then(({ url }) => {
        const origin = globalThis.location.origin;
        globalThis.open(`mpv://${origin}${url}`, "_self");
      })
      .catch((err) => {
        toast.error(err instanceof Error ? err.message : "Failed to get stream URL");
      });
  };

  const handleCopyStreamLink = (episodeNumber: number) => {
    getAnimeEpisodeStreamUrl(options.animeId, episodeNumber)
      .then(({ url }) => {
        const origin = globalThis.location.origin;
        return copyToClipboard(`${origin}${url}`);
      })
      .then(() => {
        toast.success("Link copied to clipboard");
      })
      .catch((err) => {
        toast.error(err instanceof Error ? err.message : "Failed to copy link");
      });
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
