import { useState } from "react";
import type { MediaSearchResult, UnmappedFolder } from "@/api/contracts";
import {
  useControlUnmappedFolderMutation,
  useImportUnmappedFolderMutation,
} from "@/api/system-library";
import { useProfilesQuery } from "@/api/profiles";

export function useFolderItemController(folder: UnmappedFolder) {
  const controlMutation = useControlUnmappedFolderMutation();
  const importMutation = useImportUnmappedFolderMutation();
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

  const importLabel = existingAnime ? "Use existing media" : "Add and use folder";

  const isImporting = importMutation.isPending;
  const isControlling = controlMutation.isPending;

  // Server owns the follow-up: resume/reset trigger their own scan pass.
  const handleControl = (action: "pause" | "resume" | "reset" | "refresh") => {
    controlMutation.mutate({ action, path: folder.path });
  };

  const handleImport = () => {
    const media = selectedAnime;
    if (!media) return;

    const profileName = selectedProfile?.name;
    if (!profileName) {
      return;
    }

    // One server call: the server enrolls the candidate when needed (owned
    // add policy) and maps the folder in the same operation.
    importMutation.mutate(
      {
        folder_name: folder.name,
        ...(media.already_in_library
          ? { media_id: media.id }
          : {
              candidate_id: media.id,
              ...(media.id_space == null ? {} : { candidate_id_space: media.id_space }),
              ...(media.media_kind == null ? {} : { candidate_media_kind: media.media_kind }),
            }),
        ...(profileName.length > 0 ? { profile_name: profileName } : {}),
      },
      {
        onSuccess: () => {
          setManualMatch(null);
        },
      },
    );
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