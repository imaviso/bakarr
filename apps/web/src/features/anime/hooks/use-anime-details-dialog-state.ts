import { useState } from "react";
import type {
  AnimeEpisodeDialogState,
  AnimeSearchModalState,
} from "~/features/anime/anime-details-types";

export function useAnimeDetailsDialogState() {
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [editPathOpen, setEditPathOpen] = useState(false);
  const [editProfileOpen, setEditProfileOpen] = useState(false);
  const [searchModalState, setSearchModalState] = useState<AnimeSearchModalState>({
    open: false,
    episodeNumber: 1,
  });
  const [deleteEpisodeState, setDeleteEpisodeState] = useState<AnimeEpisodeDialogState>({
    open: false,
    episodeNumber: 0,
  });
  const [mappingDialogState, setMappingDialogState] = useState<AnimeEpisodeDialogState>({
    open: false,
    episodeNumber: 0,
  });
  const [bulkMappingOpen, setBulkMappingOpen] = useState(false);

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
