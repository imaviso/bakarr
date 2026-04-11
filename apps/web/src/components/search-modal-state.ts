import { createEffect, on, type Accessor } from "solid-js";
import { toast } from "solid-sonner";
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

    grabRelease.mutate(payload, {
      onSuccess: () => {
        options.onClose();
        toast.success("Download started");
      },
      onError: (err) => {
        toast.error("Failed to queue download", {
          description: err instanceof Error ? err.message : String(err),
        });
      },
    });
  };

  return {
    grabRelease,
    handleDownload,
    searchQuery,
  };
}

export type SearchModalState = ReturnType<typeof useSearchModalState>;
