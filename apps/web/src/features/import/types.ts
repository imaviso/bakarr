import type { AnimeId, AnimeSearchResult, ScannedFile } from "~/api/contracts";

export type Step = "scan" | "review";

export type FileRowAnimeOption = {
  id: AnimeId;
  title: { romaji: string; english?: string | undefined };
  source: "library" | "candidate";
};

export interface FileRowProps {
  file: ScannedFile;
  animeOptions: FileRowAnimeOption[];
  isSelected: boolean;
  selectedAnimeId?: AnimeId | undefined;
  currentEpisode?: number | undefined;
  currentSeason?: number | null | undefined;
  onToggle: (animeId: AnimeId) => void;
  onAnimeChange: (animeId: AnimeId) => void;
  onMappingChange: (season: number, episode: number) => void;
}

export interface ManualSearchProps {
  onSelect: (candidate: AnimeSearchResult) => void;
  existingIds: Set<AnimeId>;
}

export interface CandidateCardProps {
  candidate: AnimeSearchResult;
  libraryIds: ReadonlySet<AnimeId>;
  isSelected: boolean;
  isLocal: boolean;
  isManual: boolean;
  onToggle: () => void;
  class?: string;
}
