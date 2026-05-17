import { useState } from "react";
import type { AddAnimeRequest, MediaSearchResult, UnmappedFolder } from "~/api/contracts";
import { useAddMediaMutation } from "~/api/media-mutations";
import {
  useControlUnmappedFolderMutation,
  useImportUnmappedFolderMutation,
  useScanLibraryMutation,
} from "~/api/system-library";
import { useProfilesQuery } from "~/api/profiles";
import { runFolderBackgroundMatchAction } from "~/features/scan/background-matching-actions";

export function useFolderItemController(folder: UnmappedFolder) {
  const addAnimeMutation = useAddMediaMutation();
  const controlMutation = useControlUnmappedFolderMutation();
  const importMutation = useImportUnmappedFolderMutation();
  const scanMutation = useScanLibraryMutation();
  const profilesQuery = useProfilesQuery();

  const [manualMatch, setManualMatch] = useState<MediaSearchResult | null>(null);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [selectedProfileName, setSelectedProfileName] = useState("");

  const selectedAnime = manualMatch ?? folder.suggested_matches[0] ?? null;

  const profiles = profilesQuery.data ?? [];
  const effectiveProfileName = selectedProfileName || profiles[0]?.name || "";
  const selectedProfile = profiles.find((p) => p.name === effectiveProfileName) ?? profiles[0];

  const existingAnime = selectedAnime?.already_in_library ? selectedAnime : null;

  const selectedAnimeIds =
    selectedAnime?.id === undefined ? new Set<number>() : new Set([selectedAnime.id]);

  const importLabel = existingAnime ? "Use existing anime" : "Add and use folder";

  const isImporting = addAnimeMutation.isPending || importMutation.isPending;
  const isControlling = controlMutation.isPending;

  const handleControl = (action: "pause" | "resume" | "reset" | "refresh") => {
    void runFolderBackgroundMatchAction({
      action,
      control: (data) => controlMutation.mutateAsync(data),
      path: folder.path,
      startScan: () => scanMutation.mutateAsync(),
    });
  };

  const handleImport = () => {
    const media = selectedAnime;
    if (!media) return;

    if (media.already_in_library) {
      importMutation.mutate(
        {
          media_id: media.id,
          folder_name: folder.name,
        },
        {
          onSuccess: () => {
            setManualMatch(null);
          },
        },
      );
      return;
    }

    const profileName = selectedProfile?.name;
    if (!profileName) {
      return;
    }

    const payload = buildAddMediaRequestFromFolderMatch(media, profileName, folder.path);

    addAnimeMutation.mutate(payload, {
      onSuccess: (createdAnime) => {
        importMutation.mutate(
          {
            media_id: createdAnime.id,
            folder_name: folder.name,
          },
          {
            onSuccess: () => {
              setManualMatch(null);
            },
          },
        );
      },
    });
  };

  return {
    handleControl,
    handleImport,
    importLabel,
    isControlling,
    isImporting,
    manualMatch,
    profilesQuery,
    resetConfirmOpen,
    selectedAnime,
    selectedAnimeIds,
    selectedProfile,
    setManualMatch,
    setResetConfirmOpen,
    setSelectedProfileName,
  };
}

export function buildAddMediaRequestFromFolderMatch(
  media: MediaSearchResult,
  profileName: string,
  folderPath: string,
): AddAnimeRequest {
  return {
    id: media.id,
    ...(media.media_kind === undefined ? {} : { media_kind: media.media_kind }),
    monitor_and_search: false,
    monitored: true,
    profile_name: profileName,
    release_profile_ids: [],
    root_folder: folderPath,
    use_existing_root: true,
  };
}
