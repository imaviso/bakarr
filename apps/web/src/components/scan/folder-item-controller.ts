import { useEffect, useMemo, useState } from "react";
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

  const selectedAnime = useMemo(() => {
    const manual = manualMatch;
    if (manual) {
      return manual;
    }

    return folder.suggested_matches[0] ?? null;
  }, [manualMatch, folder.suggested_matches]);

  const selectedProfile = useMemo(() => {
    const selectedName = selectedProfileName;
    const profiles = profilesQuery.data ?? [];
    const fallbackName = profiles[0]?.name ?? "";
    const resolvedName = selectedName || fallbackName;

    return profiles.find((profile) => profile.name === resolvedName) ?? profiles[0];
  }, [selectedProfileName, profilesQuery.data]);

  useEffect(() => {
    if (!selectedProfileName && profilesQuery.data?.[0]?.name) {
      setSelectedProfileName(profilesQuery.data[0].name);
    }
  }, [selectedProfileName, profilesQuery.data]);

  const existingAnime = useMemo(
    () => (selectedAnime?.already_in_library ? selectedAnime : null),
    [selectedAnime],
  );

  const selectedAnimeIds = useMemo(() => {
    const animeId = selectedAnime?.id;
    return animeId === undefined ? new Set<number>() : new Set([animeId]);
  }, [selectedAnime]);

  const importLabel = useMemo(
    () => (existingAnime ? "Use existing anime" : "Add and use folder"),
    [existingAnime],
  );

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
