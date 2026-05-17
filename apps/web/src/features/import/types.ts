import type { MediaId, MediaSearchResult, ScannedFile } from "~/api/contracts";

export type Step = "scan" | "review";

export type FileRowAnimeOption = {
  id: MediaId;
  title: { romaji: string; english?: string | undefined };
  source: "library" | "candidate";
};

export interface FileRowProps {
  file: ScannedFile;
  animeOptions: FileRowAnimeOption[];
  isSelected: boolean;
  selectedAnimeId?: MediaId | undefined;
  currentEpisode?: number | undefined;
  currentSeason?: number | null | undefined;
  onToggle: (mediaId: MediaId) => void;
  onAnimeChange: (mediaId: MediaId) => void;
  onMappingChange: (season: number, episode: number) => void;
}

export interface ManualSearchProps {
  onSelect: (candidate: MediaSearchResult) => void;
  existingIds: Set<MediaId>;
}

export interface CandidateCardProps {
  candidate: MediaSearchResult;
  libraryIds: ReadonlySet<MediaId>;
  isSelected: boolean;
  isLocal: boolean;
  isManual: boolean;
  onToggle: () => void;
  class?: string;
}
