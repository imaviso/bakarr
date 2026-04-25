import type { AnimeSearchResult, ScannedFile } from "~/api";

export type Step = "scan" | "review";

export type FileRowAnimeOption = {
  id: number;
  title: { romaji: string; english?: string | undefined };
  source: "library" | "candidate";
};

export interface FileRowProps {
  file: ScannedFile;
  animeOptions: FileRowAnimeOption[];
  isSelected: boolean;
  selectedAnimeId?: number | undefined;
  currentEpisode?: number | undefined;
  currentSeason?: number | null | undefined;
  onToggle: (animeId: number) => void;
  onAnimeChange: (animeId: number) => void;
  onMappingChange: (season: number, episode: number) => void;
}

export interface ManualSearchProps {
  onSelect: (candidate: AnimeSearchResult) => void;
  existingIds: Set<number>;
}

export interface CandidateCardProps {
  candidate: AnimeSearchResult;
  libraryIds: ReadonlySet<number>;
  isSelected: boolean;
  isLocal: boolean;
  isManual: boolean;
  onToggle: () => void;
  class?: string;
}
