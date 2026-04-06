import type { AnimeSearchResult, ScannedFile } from "~/lib/api";

export type Step = "scan" | "review";

export interface FileRowProps {
  file: ScannedFile;
  animeList: { id: number; title: { romaji: string; english?: string | undefined } }[];
  candidates: AnimeSearchResult[];
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
