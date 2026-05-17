import { useUnitSearchQuery } from "~/api/media";
import { useGrabReleaseMutation } from "~/api/media-mutations";
import type { UnitSearchResult } from "~/api/contracts";
import { buildGrabInputFromEpisodeResult } from "~/domain/release/grab";

interface SearchModalStateOptions {
  mediaId: number;
  unitNumber: number;
  open: boolean;
  onClose: () => void;
}

export function useSearchModalState(options: SearchModalStateOptions) {
  const searchQuery = useUnitSearchQuery(options.mediaId, options.unitNumber, options.open);
  const grabRelease = useGrabReleaseMutation();

  const handleDownload = (release: UnitSearchResult) => {
    const payload = buildGrabInputFromEpisodeResult({
      mediaId: options.mediaId,
      unitNumber: options.unitNumber,
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
