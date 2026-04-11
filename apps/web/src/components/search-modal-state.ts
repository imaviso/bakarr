import { createEffect, on, type Accessor } from "solid-js";
import {
  createEpisodeSearchQuery,
  createGrabReleaseMutation,
  type EpisodeSearchResult,
} from "~/lib/api";
import { buildGrabInputFromEpisodeResult } from "~/lib/release-grab";

interface SearchModalStateOptions {
  animeId: Accessor<number>;
  episodeNumber: Accessor<number>;
  open: Accessor<boolean>;
  onClose: () => void;
}

export function useSearchModalState(options: SearchModalStateOptions) {
  const searchQuery = createEpisodeSearchQuery(options.animeId, options.episodeNumber);
  const grabRelease = createGrabReleaseMutation();

  createEffect(
    on(options.open, (isOpen) => {
      if (isOpen) {
        void searchQuery.refetch();
      }
    }),
  );

  const handleDownload = (release: EpisodeSearchResult) => {
    const payload = buildGrabInputFromEpisodeResult({
      animeId: options.animeId(),
      episodeNumber: options.episodeNumber(),
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
