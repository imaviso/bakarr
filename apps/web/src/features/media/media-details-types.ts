import type { MediaUnitKind } from "@/api/contracts";

export interface AnimeEpisodeDialogState {
  open: boolean;
  unitNumber: number;
  unitKind?: MediaUnitKind | null | undefined;
}

export interface AnimeSearchModalState {
  open: boolean;
  unitNumber: number;
  unitTitle?: string | null | undefined;
  unitKind?: MediaUnitKind | null | undefined;
}
