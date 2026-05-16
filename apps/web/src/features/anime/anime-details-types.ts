import type { MediaUnitKind } from "~/api/contracts";

export interface AnimeEpisodeDialogState {
  open: boolean;
  episodeNumber: number;
  unitKind?: MediaUnitKind | undefined;
}

export interface AnimeSearchModalState {
  open: boolean;
  episodeNumber: number;
  episodeTitle?: string;
  unitKind?: MediaUnitKind | undefined;
}
