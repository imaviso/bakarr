import { createSignal } from "solid-js";
import type {
  AnimeEpisodeDialogState,
  AnimeSearchModalState,
} from "~/components/anime/anime-details-types";

export function useAnimeDetailsDialogState() {
  const [renameDialogOpen, setRenameDialogOpen] = createSignal(false);
  const [editPathOpen, setEditPathOpen] = createSignal(false);
  const [editProfileOpen, setEditProfileOpen] = createSignal(false);
  const [searchModalState, setSearchModalState] = createSignal<AnimeSearchModalState>({
    open: false,
    episodeNumber: 1,
  });
  const [deleteEpisodeState, setDeleteEpisodeState] = createSignal<AnimeEpisodeDialogState>({
    open: false,
    episodeNumber: 0,
  });
  const [mappingDialogState, setMappingDialogState] = createSignal<AnimeEpisodeDialogState>({
    open: false,
    episodeNumber: 0,
  });
  const [bulkMappingOpen, setBulkMappingOpen] = createSignal(false);

  return {
    bulkMappingOpen,
    deleteEpisodeState,
    editPathOpen,
    editProfileOpen,
    mappingDialogState,
    renameDialogOpen,
    searchModalState,
    setBulkMappingOpen,
    setDeleteEpisodeState,
    setEditPathOpen,
    setEditProfileOpen,
    setMappingDialogState,
    setRenameDialogOpen,
    setSearchModalState,
  };
}
