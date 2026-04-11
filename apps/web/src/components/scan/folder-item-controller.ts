import { createEffect, createMemo, createSignal, type Accessor } from "solid-js";
import { toast } from "solid-sonner";
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
import { normalizeApiErrorMessage } from "~/components/scan/folder-item-utils";

export function createFolderItemController(folder: Accessor<UnmappedFolder>) {
  const addAnimeMutation = createAddAnimeMutation();
  const controlMutation = createControlUnmappedFolderMutation();
  const importMutation = createImportUnmappedFolderMutation();
  const scanMutation = createScanLibraryMutation();
  const profilesQuery = createProfilesQuery();

  const [manualMatch, setManualMatch] = createSignal<AnimeSearchResult | null>(null);
  const [manualDialogOpen, setManualDialogOpen] = createSignal(false);
  const [resetConfirmOpen, setResetConfirmOpen] = createSignal(false);
  const [selectedProfileName, setSelectedProfileName] = createSignal("");

  const selectedAnime = createMemo(() => {
    const manual = manualMatch();
    if (manual) {
      return manual;
    }

    return folder().suggested_matches[0] ?? null;
  });

  const selectedProfile = createMemo(() => {
    const selectedName = selectedProfileName();
    const profiles = profilesQuery.data ?? [];
    const fallbackName = profiles[0]?.name ?? "";
    const resolvedName = selectedName || fallbackName;

    return profiles.find((profile) => profile.name === resolvedName) ?? profiles[0];
  });

  createEffect(() => {
    if (!selectedProfileName() && profilesQuery.data?.[0]?.name) {
      setSelectedProfileName(profilesQuery.data[0].name);
    }
  });

  const existingAnime = createMemo(() =>
    selectedAnime()?.already_in_library ? selectedAnime() : null,
  );
  const selectedAnimeIds = createMemo(() => {
    const animeId = selectedAnime()?.id;
    return animeId === undefined ? new Set<number>() : new Set([animeId]);
  });
  const importLabel = createMemo(() =>
    existingAnime() ? "Use existing anime" : "Add and use folder",
  );

  const isImporting = () => addAnimeMutation.isPending || importMutation.isPending;
  const isControlling = () => controlMutation.isPending;

  const handleControl = (action: "pause" | "resume" | "reset" | "refresh") => {
    const labels: Record<typeof action, string> = {
      pause: "Paused automatic matching",
      refresh: "Refreshing match",
      reset: "Reset match state",
      resume: "Resumed automatic matching",
    };

    toast.promise(
      runFolderBackgroundMatchAction({
        action,
        control: (data) => controlMutation.mutateAsync(data),
        path: folder().path,
        startScan: () => scanMutation.mutateAsync(),
      }),
      {
        loading: `${labels[action]}...`,
        success: labels[action],
        error: (err) => `Failed to ${action} folder: ${err.message}`,
      },
    );
  };

  const handleImport = async () => {
    const anime = selectedAnime();
    if (!anime) return;

    try {
      let animeId = anime.id;

      if (!anime.already_in_library) {
        const profileName = selectedProfile()?.name;
        if (!profileName) {
          throw new Error("No quality profile is available yet.");
        }

        const payload: AddAnimeRequest = {
          id: anime.id,
          monitor_and_search: false,
          monitored: true,
          profile_name: profileName,
          release_profile_ids: [],
          root_folder: folder().path,
          use_existing_root: true,
        };
        const createdAnime = await addAnimeMutation.mutateAsync(payload);
        animeId = createdAnime.id;
      }

      await importMutation.mutateAsync({
        anime_id: animeId,
        folder_name: folder().name,
      });
      const action = anime.already_in_library ? "Linked" : "Added";
      setManualMatch(null);
      toast.success(`${action} ${anime.title.romaji}`);
    } catch (error) {
      const message =
        error instanceof Error
          ? normalizeApiErrorMessage(error.message)
          : "Failed to import folder";
      toast.error(message);
    }
  };

  return {
    handleControl,
    handleImport,
    importLabel,
    isControlling,
    isImporting,
    manualDialogOpen,
    manualMatch,
    profilesQuery,
    resetConfirmOpen,
    selectedAnime,
    selectedAnimeIds,
    selectedProfile,
    setManualDialogOpen,
    setManualMatch,
    setResetConfirmOpen,
    setSelectedProfileName,
  };
}
