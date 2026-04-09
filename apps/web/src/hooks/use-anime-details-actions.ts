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
import { copyToClipboard } from "~/lib/utils";
import { toast } from "solid-sonner";

interface UseAnimeDetailsActionsOptions {
  animeId: () => number;
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

  const handlePlayInMpv = async (episodeNumber: number) => {
    try {
      const { url } = await getAnimeEpisodeStreamUrl(options.animeId(), episodeNumber);
      const origin = globalThis.location.origin;
      globalThis.open(`mpv://${origin}${url}`, "_self");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not generate stream link.";
      toast.error(message);
    }
  };

  const handleCopyStreamLink = async (episodeNumber: number) => {
    try {
      const { url } = await getAnimeEpisodeStreamUrl(options.animeId(), episodeNumber);
      const origin = globalThis.location.origin;
      const copied = await copyToClipboard(`${origin}${url}`);
      if (copied) {
        toast.success("Stream URL copied to clipboard");
      } else {
        toast.error("Failed to copy stream url");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not copy stream link.";
      toast.error(message);
    }
  };

  const handleToggleMonitor = (isMonitored: boolean) => {
    toggleMonitor.mutate({
      id: options.animeId(),
      monitored: !isMonitored,
    });
  };

  const handleRefreshEpisodes = () => {
    refreshEpisodes.mutate(options.animeId());
  };

  const handleSearchMissing = () => {
    searchMissing.mutate(options.animeId());
  };

  const handleScanFolder = () => {
    void toast.promise(scanFolder.mutateAsync(options.animeId()), {
      loading: "Scanning folder...",
      success: (data) => `Scan complete. Found ${data.found} new episodes.`,
      error: (err) => `Scan failed: ${err.message}`,
    });
  };

  const handleDeleteAnime = (onSuccess: () => void) => {
    deleteAnime.mutate(options.animeId(), { onSuccess });
  };

  const handleDeleteEpisodeFile = (episodeNumber: number) => {
    deleteEpisodeFile.mutate(
      {
        animeId: options.animeId(),
        episodeNumber,
      },
      {
        onSuccess: () => {
          toast.success("Episode file deleted");
        },
        onError: (err) => {
          toast.error(`Failed to delete file: ${err.message}`);
        },
      },
    );
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
    isRefreshPending: () => refreshEpisodes.isPending,
    isSearchMissingPending: () => searchMissing.isPending,
    isToggleMonitorPending: () => toggleMonitor.isPending,
    isUpdatingPath: () => updatePath.isPending,
    isUpdatingProfile: () => updateProfile.isPending,
    isUpdatingReleaseProfiles: () => updateReleaseProfiles.isPending,
    updatePath: updatePath.mutateAsync,
    updateProfile: updateProfile.mutateAsync,
    updateReleaseProfiles: updateReleaseProfiles.mutateAsync,
  };
}
