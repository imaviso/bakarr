import type { Anime } from "@bakarr/shared";

export type AnimeMonitorFilter = "all" | "monitored" | "unmonitored";

export function filterAnimeLibrary(
  animeList: Anime[],
  query: string,
  monitorFilter: AnimeMonitorFilter,
): Anime[] {
  const searchQuery = query.trim().toLowerCase();

  return animeList.filter((anime) => {
    const matchesSearch =
      searchQuery.length === 0 ||
      anime.title.romaji.toLowerCase().includes(searchQuery) ||
      anime.title.english?.toLowerCase().includes(searchQuery) ||
      anime.title.native?.toLowerCase().includes(searchQuery);

    const matchesMonitor =
      monitorFilter === "all" ||
      (monitorFilter === "monitored" && anime.monitored) ||
      (monitorFilter === "unmonitored" && !anime.monitored);

    return matchesSearch && matchesMonitor;
  });
}
