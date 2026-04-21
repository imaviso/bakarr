import { useEffect } from "react";
import {
  createEpisodeSearchQuery,
  createGrabReleaseMutation,
  type EpisodeSearchResult,
} from "~/lib/api";
import { buildGrabInputFromEpisodeResult } from "~/lib/release-grab";

interface SearchModalStateOptions {
  animeId: number;
  episodeNumber: number;
  open: boolean;
  onClose: () => void;
}

export function useSearchModalState(options: SearchModalStateOptions) {
  const searchQuery = createEpisodeSearchQuery(options.animeId, options.episodeNumber);
  const grabRelease = createGrabReleaseMutation();

  useEffect(() => {
    if (options.open) {
      void searchQuery.refetch();
    }
  }, [options.open, searchQuery]);

  const handleDownload = (release: EpisodeSearchResult) => {
    const payload = buildGrabInputFromEpisodeResult({
      animeId: options.animeId,
      episodeNumber: options.episodeNumber,
      result: release,
    });

    grabRelease.mutate(payload);
    options.onClose();
  };

  return {
    grabRelease,
    handleDownload,
    searchQuery,
  };
}

export type SearchModalState = ReturnType<typeof useSearchModalState>;
