import { useEpisodeSearchQuery } from "~/api/anime";
import { useGrabReleaseMutation } from "~/api/anime-mutations";
import type { EpisodeSearchResult } from "~/api/contracts";
import { buildGrabInputFromEpisodeResult } from "~/domain/release/grab";

interface SearchModalStateOptions {
  animeId: number;
  episodeNumber: number;
  open: boolean;
  onClose: () => void;
}

export function useSearchModalState(options: SearchModalStateOptions) {
  const searchQuery = useEpisodeSearchQuery(options.animeId, options.episodeNumber, options.open);
  const grabRelease = useGrabReleaseMutation();

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
