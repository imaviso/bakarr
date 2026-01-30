import type { AnimeSearchResult, ScannedFile } from "~/lib/api";

export type Step = "scan" | "review";

export interface FileRowProps {
	file: ScannedFile;
	animeList: { id: number; title: { romaji: string; english?: string } }[];
	candidates: AnimeSearchResult[];
	isSelected: boolean;
	selectedAnimeId?: number;
	currentEpisode?: number;
	currentSeason?: number | null;
	onToggle: (animeId: number) => void;
	onAnimeChange: (animeId: number) => void;
	onMappingChange: (season: number, episode: number) => void;
}

export interface ManualSearchProps {
	onSelect: (candidate: AnimeSearchResult) => void;
	existingIds: Set<number>;
}
