import { createContext, useContext, type ReactNode } from "react";
import type {
  AnimeEpisodeDialogState,
  AnimeSearchModalState,
} from "~/features/anime/anime-details-types";
import type { Episode, QualityProfile, ReleaseProfile } from "~/api/contracts";

interface AnimeDetailsDialogsContextValue {
  animeId: number;
  episodes: readonly Episode[];
  // Dialog state
  searchModalState: AnimeSearchModalState;
  renameDialogOpen: boolean;
  mappingDialogState: AnimeEpisodeDialogState;
  bulkMappingOpen: boolean;
  deleteEpisodeState: AnimeEpisodeDialogState;
  editPathOpen: boolean;
  editProfileOpen: boolean;
  currentPath: string;
  currentProfile: string;
  currentReleaseProfileIds: number[];
  profiles: readonly QualityProfile[];
  releaseProfiles: readonly ReleaseProfile[];
  // Actions
  onSearchModalOpenChange: (open: boolean) => void;
  onRenameDialogOpenChange: (open: boolean) => void;
  onMappingDialogOpenChange: (open: boolean) => void;
  onBulkMappingOpenChange: (open: boolean) => void;
  onDeleteEpisodeDialogOpenChange: (open: boolean) => void;
  onConfirmDeleteEpisode: () => void;
  onEditPathOpenChange: (open: boolean) => void;
  updatePath: (input: { id: number; path: string; rescan?: boolean }) => Promise<unknown>;
  isUpdatingPath: boolean;
  onEditProfileOpenChange: (open: boolean) => void;
  updateProfile: (input: { id: number; profileName: string }) => Promise<unknown>;
  isUpdatingProfile: boolean;
  updateReleaseProfiles: (input: { id: number; releaseProfileIds: number[] }) => Promise<unknown>;
  isUpdatingReleaseProfiles: boolean;
}

const AnimeDetailsDialogsContext = createContext<AnimeDetailsDialogsContextValue | null>(null);

export function AnimeDetailsDialogsProvider({
  children,
  value,
}: {
  children: ReactNode;
  value: AnimeDetailsDialogsContextValue;
}) {
  return (
    <AnimeDetailsDialogsContext.Provider value={value}>
      {children}
    </AnimeDetailsDialogsContext.Provider>
  );
}

export function useAnimeDetailsDialogs() {
  const ctx = useContext(AnimeDetailsDialogsContext);
  if (!ctx) {
    throw new Error("useAnimeDetailsDialogs must be used within AnimeDetailsDialogsProvider");
  }
  return ctx;
}
