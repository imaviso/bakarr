import type { MediaUnitKind } from "~/api/contracts";

export interface AnimeEpisodeDialogState {
  open: boolean;
  unitNumber: number;
  unitKind?: MediaUnitKind | undefined;
}

export interface AnimeSearchModalState {
  open: boolean;
  unitNumber: number;
  unitTitle?: string;
  unitKind?: MediaUnitKind | undefined;
}
