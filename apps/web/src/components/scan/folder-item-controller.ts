import { useState } from "react";
import {
  type AddAnimeRequest,
  type AnimeSearchResult,
  createAddAnimeMutation,
  createControlUnmappedFolderMutation,
  createImportUnmappedFolderMutation,
  createProfilesQuery,
  createScanLibraryMutation,
  type UnmappedFolder,
} from "~/lib/api";
import { runFolderBackgroundMatchAction } from "~/components/scan/background-matching-actions";

export function useFolderItemController(folder: UnmappedFolder) {
  const addAnimeMutation = createAddAnimeMutation();
  const controlMutation = createControlUnmappedFolderMutation();
  const importMutation = createImportUnmappedFolderMutation();
  const scanMutation = createScanLibraryMutation();
  const profilesQuery = createProfilesQuery();

  const [manualMatch, setManualMatch] = useState<AnimeSearchResult | null>(null);
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
    const anime = selectedAnime;
    if (!anime) return;

    if (anime.already_in_library) {
      importMutation.mutate(
        {
          anime_id: anime.id,
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

    const payload: AddAnimeRequest = {
      id: anime.id,
      monitor_and_search: false,
      monitored: true,
      profile_name: profileName,
      release_profile_ids: [],
      root_folder: folder.path,
      use_existing_root: true,
    };

    addAnimeMutation.mutate(payload, {
      onSuccess: (createdAnime) => {
        importMutation.mutate(
          {
            anime_id: createdAnime.id,
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
