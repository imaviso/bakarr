import { createEpisodeSearchQuery } from "~/api/anime";
import { createGrabReleaseMutation } from "~/api/anime-mutations";
import type { EpisodeSearchResult } from "~/api/contracts";
import { buildGrabInputFromEpisodeResult } from "~/domain/release/grab";

interface SearchModalStateOptions {
  animeId: number;
  episodeNumber: number;
  open: boolean;
  onClose: () => void;
}

export function useSearchModalState(options: SearchModalStateOptions) {
  const searchQuery = createEpisodeSearchQuery(
    options.animeId,
    options.episodeNumber,
    options.open,
  );
  const grabRelease = createGrabReleaseMutation();

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
