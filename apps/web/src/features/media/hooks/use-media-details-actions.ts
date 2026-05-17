import {
  useDeleteMediaMutation,
  useDeleteUnitFileMutation,
  useRefreshUnitsMutation,
  useScanFolderMutation,
  useToggleMonitorMutation,
  useUpdateMediaPathMutation,
  useUpdateMediaProfileMutation,
  useUpdateMediaReleaseProfilesMutation,
} from "~/api/media-mutations";
import { useSearchMissingMutation } from "~/api/system-downloads";
import { useAnimeEpisodeStreamUrlMutation } from "~/api/auth";
import { Effect } from "effect";
import { useState } from "react";
import { toast } from "sonner";
import { errorMessage } from "~/api/effect/errors";
import { copyToClipboard } from "~/infra/utils";

interface UseAnimeDetailsActionsOptions {
  mediaId: number;
}

export function useAnimeDetailsActions(options: UseAnimeDetailsActionsOptions) {
  const deleteMedia = useDeleteMediaMutation();
  const refreshEpisodes = useRefreshUnitsMutation();
  const scanFolder = useScanFolderMutation();
  const searchMissing = useSearchMissingMutation();
  const toggleMonitor = useToggleMonitorMutation();
  const deleteEpisodeFile = useDeleteUnitFileMutation();
  const updatePath = useUpdateMediaPathMutation();
  const updateProfile = useUpdateMediaProfileMutation();
  const updateReleaseProfiles = useUpdateMediaReleaseProfilesMutation();
  const streamUrl = useAnimeEpisodeStreamUrlMutation();
  const [latestScanTaskId, setLatestScanTaskId] = useState<number | undefined>(undefined);

  const handlePlayInMpv = (unitNumber: number) => {
    streamUrl.mutate(
      { mediaId: options.mediaId, unitNumber },
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

  const handleCopyStreamLink = (unitNumber: number) => {
    streamUrl.mutate(
      { mediaId: options.mediaId, unitNumber },
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
      id: options.mediaId,
      monitored: !isMonitored,
    });
  };

  const handleRefreshEpisodes = () => {
    refreshEpisodes.mutate(options.mediaId);
  };

  const handleSearchMissing = () => {
    searchMissing.mutate(options.mediaId);
  };

  const handleScanFolder = () => {
    scanFolder.mutate(options.mediaId, {
      onSuccess: (accepted) => {
        setLatestScanTaskId(accepted.task_id);
      },
    });
  };

  const handleDeleteAnime = (onSuccess: () => void) => {
    deleteMedia.mutate(options.mediaId, { onSuccess });
  };

  const handleDeleteEpisodeFile = (unitNumber: number) => {
    deleteEpisodeFile.mutate({
      mediaId: options.mediaId,
      unitNumber,
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
